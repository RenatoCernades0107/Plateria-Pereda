-- Clientes duplicados (pedido del 2026-10-30): un mismo cliente registrado dos veces
-- termina con dos fichas en Shopify y choca allí («Phone has already been taken»).
--   1. `similar_clients`: al registrar un cliente se avisa si ya hay uno activo con el
--      mismo nombre (sin importar mayúsculas ni tildes), documento, teléfono o email.
--   2. `merge_clients` (solo admin): pasa las guías y cotizaciones de una persona
--      duplicada a la que se queda y desactiva la duplicada (`merged_into`). No toca
--      Shopify: las dos fichas siguen allí, con su historial.

-- 1. Clientes parecidos.

-- "María  Pía" → "maria pia": minúsculas, sin tildes y con un solo espacio.
create function private.normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(trim(coalesce(p_name, ''))), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '\s+', ' ', 'g'
  );
$$;

revoke execute on function private.normalize_name(text) from public, anon;
grant execute on function private.normalize_name(text) to authenticated;

-- Hasta 5 clientes activos que coinciden en algo; cada columna `same_*` dice en qué.
-- `p_phone` llega en E.164 y `p_email` en minúsculas (como se guardan).
create function public.similar_clients(
  p_name text,
  p_document_number text,
  p_phone text,
  p_email text,
  p_exclude uuid default null
)
returns table (
  id uuid,
  kind public.client_kind,
  display_name text,
  document_type public.document_type,
  document_number text,
  phone text,
  email text,
  same_name boolean,
  same_document boolean,
  same_phone boolean,
  same_email boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select private.normalize_name(p_name) as name,
      nullif(trim(coalesce(p_document_number, '')), '') as document,
      nullif(trim(coalesce(p_phone, '')), '') as phone,
      nullif(lower(trim(coalesce(p_email, ''))), '') as email
  ), m as (
    select c.*,
      q.name <> '' and private.normalize_name(c.display_name) = q.name as same_name,
      coalesce(c.document_number = q.document, false) as same_document,
      coalesce(c.phone = q.phone, false) as same_phone,
      coalesce(c.email = q.email, false) as same_email
    from public.clients c, q
    where c.active and c.id is distinct from p_exclude
  )
  select m.id, m.kind, m.display_name, m.document_type, m.document_number, m.phone, m.email,
    m.same_name, m.same_document, m.same_phone, m.same_email
  from m
  where private.has_role('{admin,ventas}')
    and (m.same_name or m.same_document or m.same_phone or m.same_email)
  order by m.same_document desc, m.same_phone desc, m.same_email desc, m.display_name
  limit 5;
$$;

revoke execute on function public.similar_clients(text, text, text, text, uuid) from public, anon;
grant execute on function public.similar_clients(text, text, text, text, uuid) to authenticated;

-- 2. Fusión.

alter table public.clients
  add column merged_into uuid references public.clients (id) on delete restrict,
  add constraint clients_merged_into_other check (merged_into is distinct from id);

comment on column public.clients.merged_into is
  'Cliente al que se pasaron sus guías y cotizaciones al fusionar duplicados (merge_clients).';

create function private.merging_clients()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.merging_clients', true), '') = 'on';
$$;

grant execute on function private.merging_clients() to authenticated;

-- Fuera de borrador una cotización no cambia de cliente, salvo al fusionar duplicados
-- (es la misma persona). Lo demás, como en 20261029120000.
create or replace function private.quote_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'borrador' and (
    (new.client_id is distinct from old.client_id and not private.merging_clients())
    or new.contact_id is distinct from old.contact_id
    or new.validity_days is distinct from old.validity_days
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.payment_condition is distinct from old.payment_condition
    or new.delivery_days is distinct from old.delivery_days
  ) then
    raise exception 'Solo se puede editar una cotización en borrador'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'borrador' and new.status = 'emitida')
      or (old.status = 'emitida' and new.status in ('aceptada', 'rechazada'))
      or (old.status in ('aceptada', 'rechazada') and new.status = 'emitida')
    ) then
      raise exception 'No se puede pasar una cotización de % a %', old.status, new.status
        using errcode = '23514';
    end if;
    if old.status = 'borrador' then
      if not exists (select 1 from public.quote_items where quote_id = new.id) then
        raise exception 'La cotización necesita al menos una línea para emitirse'
          using errcode = '23514';
      end if;
      new.issue_date := private.lima_today();
      new.issued_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Pasa todo lo de `p_remove` a `p_keep` (dos personas) y desactiva `p_remove`.
--   * Guías, cotizaciones y cotizaciones de WhatsApp cambian de cliente.
--   * El documento pasa a `p_keep` si no tenía (no va a Shopify en las personas).
--   * El teléfono y el email de `p_remove` quedan anotados en las notas de `p_keep`:
--     copiarlos lo enviaría a Shopify, donde aún los tiene la ficha de `p_remove`.
create function public.merge_clients(p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.clients;
  v_remove public.clients;
  v_restorations integer;
  v_quotes integer;
  v_whatsapp integer;
  v_today text := to_char(private.lima_today(), 'DD/MM/YYYY');
  v_data text;
begin
  if not private.has_role('{admin}') then
    raise exception 'Solo el administrador puede fusionar clientes' using errcode = '42501';
  end if;
  if p_keep is not distinct from p_remove then
    raise exception 'Elige dos clientes distintos' using errcode = '23514';
  end if;

  -- En orden de id, para que dos fusiones a la vez no se bloqueen entre sí.
  perform 1 from public.clients where id in (p_keep, p_remove) order by id for update;
  select * into v_keep from public.clients where id = p_keep;
  select * into v_remove from public.clients where id = p_remove;
  if v_keep.id is null or v_remove.id is null then
    raise exception 'El cliente no existe' using errcode = '23514';
  end if;
  if v_keep.kind <> 'persona' or v_remove.kind <> 'persona' then
    raise exception 'Por ahora solo se pueden fusionar personas' using errcode = '23514';
  end if;
  if v_keep.merged_into is not null or v_remove.merged_into is not null then
    raise exception 'Uno de los clientes ya se fusionó con otro' using errcode = '23514';
  end if;

  perform set_config('app.merging_clients', 'on', true);
  update public.restorations set client_id = p_keep where client_id = p_remove;
  get diagnostics v_restorations = row_count;
  update public.quotes set client_id = p_keep where client_id = p_remove;
  get diagnostics v_quotes = row_count;
  update public.whatsapp_quotes set client_id = p_keep where client_id = p_remove;
  get diagnostics v_whatsapp = row_count;
  perform set_config('app.merging_clients', '', true);

  update public.clients
  set merged_into = p_keep,
    active = false,
    document_type = null,
    document_number = null,
    notes = left(ltrim(notes || E'\n' || format('Fusionado en %s el %s.', v_keep.display_name, v_today), E'\n'), 2000)
  where id = p_remove;

  v_data := concat_ws(', ',
    case when v_remove.phone is distinct from v_keep.phone then 'tel. ' || v_remove.phone end,
    case when v_remove.email is distinct from v_keep.email then v_remove.email end
  );
  update public.clients
  set document_type = coalesce(v_keep.document_type, v_remove.document_type),
    document_number = coalesce(v_keep.document_number, v_remove.document_number),
    active = true,
    notes = left(ltrim(notes || E'\n' || format(
      'Fusionado con %s el %s%s.', v_remove.display_name, v_today,
      case when v_data <> '' then ' (' || v_data || ')' else '' end
    ), E'\n'), 2000)
  where id = p_keep;

  return jsonb_build_object(
    'restorations', v_restorations,
    'quotes', v_quotes,
    'whatsappQuotes', v_whatsapp
  );
end;
$$;

revoke execute on function public.merge_clients(uuid, uuid) from public, anon;
grant execute on function public.merge_clients(uuid, uuid) to authenticated;
