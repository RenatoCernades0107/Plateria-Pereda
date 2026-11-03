-- Teléfono de contacto (pedido del 2026-11-03): a veces dos personas comparten un número
-- (p. ej., una clienta que hace un pedido para ella y otro para su mamá, cada uno a su
-- nombre). En Shopify el teléfono del Customer es único, así que el segundo cliente no
-- puede llevar ese número. Se guarda entonces como `contact_phone`:
--   * Solo personas, y o teléfono propio o teléfono de contacto, nunca los dos.
--   * No es único y no va a Shopify (los triggers de sincronización no lo miran).
--   * WhatsApp, la guía y las cotizaciones usan el que tenga: coalesce(phone, contact_phone).
--   * Si Shopify manda un teléfono para un cliente que usa teléfono de contacto, se ignora:
--     se respeta lo que se eligió en el sistema (y no se vuelve a pisar en cada webhook).

alter table public.clients
  add column contact_phone text check (contact_phone ~ '^\+[1-9]\d{6,14}$'),
  add constraint clients_one_phone check (phone is null or contact_phone is null),
  add constraint clients_contact_phone_persona check (kind = 'persona' or contact_phone is null);

comment on column public.clients.contact_phone is
  'Teléfono de otra persona por el que se contacta al cliente (no es único ni va a Shopify).';

create index clients_contact_phone_trgm on public.clients
  using gin (contact_phone extensions.gin_trgm_ops);

-- 1. Un teléfono que llega de Shopify no pisa el teléfono de contacto.
create function private.keep_contact_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.change_from_shopify() and old.contact_phone is not null
    and new.contact_phone is not distinct from old.contact_phone then
    new.phone := old.phone;
  end if;
  return new;
end;
$$;

revoke execute on function private.keep_contact_phone() from public, anon, authenticated;

create trigger clients_keep_contact_phone
  before update of phone on public.clients
  for each row execute function private.keep_contact_phone();

-- 2. Listado de clientes: muestra el teléfono que tenga y busca también por el de contacto.
--    Igual que en 20261004203436, salvo `phone` y el filtro por teléfono.
create or replace function public.list_clients(
  p_query text default null,
  p_kind public.client_kind default null,
  p_sync text default null,
  p_active boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind public.client_kind,
  display_name text,
  document_type public.document_type,
  document_number text,
  phone text,
  email text,
  active boolean,
  job_id bigint,
  sync_status text,
  last_error text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select c.id, c.kind, c.display_name, c.document_type, c.document_number,
      coalesce(c.phone, c.contact_phone) as phone,
      c.email, c.active, c.created_at, j.id as job_id, j.last_error,
      case
        when j.status is not null then j.status
        when coalesce(c.shopify_customer_id, c.shopify_company_id) is not null then 'ok'
      end as sync_status
    from public.clients c
    left join lateral (
      select sj.id, sj.status, sj.last_error
      from public.shopify_sync_jobs sj
      where sj.entity_table = 'clients' and sj.entity_id = c.id::text
      order by sj.created_at desc, sj.id desc
      limit 1
    ) j on true
    where (select private.current_app_role()) is not null
      and (p_kind is null or c.kind = p_kind)
      and (p_active is null or c.active = p_active)
      and (
        nullif(trim(p_query), '') is null
        or c.display_name ilike '%' || trim(p_query) || '%'
        or c.document_number ilike '%' || trim(p_query) || '%'
        or c.email ilike '%' || trim(p_query) || '%'
        or (
          length(regexp_replace(p_query, '\D', '', 'g')) >= 3
          and (
            c.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
            or c.contact_phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
          )
        )
      )
  )
  select f.id, f.kind, f.display_name, f.document_type, f.document_number, f.phone,
    f.email, f.active, f.job_id, f.sync_status, f.last_error, count(*) over ()
  from filtered f
  where p_sync is null
    or (p_sync = 'ok' and f.sync_status = 'ok')
    or (p_sync = 'pending' and f.sync_status in ('pending', 'processing'))
    or (p_sync = 'error' and f.sync_status = 'error')
  order by f.created_at desc, f.id
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- 3. Clientes parecidos: el mismo número como teléfono propio o de contacto cuenta como
--    «mismo teléfono». Se devuelve el teléfono que tenga cada uno y `uses_contact_phone`
--    (es un teléfono de contacto): compartir así el número no los hace duplicados.
--    Igual que en 20261031120000, salvo `phone`, `same_phone` y `uses_contact_phone`.
drop function public.similar_clients(text, text, text, text, uuid);

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
  same_email boolean,
  uses_contact_phone boolean
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
      coalesce(coalesce(c.phone, c.contact_phone) = q.phone, false) as same_phone,
      coalesce(c.email = q.email, false) as same_email
    from public.clients c, q
    where c.active and c.id is distinct from p_exclude
  )
  select m.id, m.kind, m.display_name, m.document_type, m.document_number,
    coalesce(m.phone, m.contact_phone), m.email,
    m.same_name, m.same_document, m.same_phone, m.same_email,
    m.contact_phone is not null
  from m
  where private.has_role('{admin,ventas}')
    and (m.same_name or m.same_document or m.same_phone or m.same_email)
  order by m.same_document desc, m.same_phone desc, m.same_email desc, m.display_name
  limit 5;
$$;

revoke execute on function public.similar_clients(text, text, text, text, uuid) from public, anon;
grant execute on function public.similar_clients(text, text, text, text, uuid) to authenticated;

-- 4. La cotización guarda el teléfono que tenga el cliente. Igual que en 20261004223320,
--    salvo `client_phone`.
create or replace function private.quote_snapshot_client()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c public.clients;
  k public.contacts;
begin
  if tg_op = 'UPDATE'
    and new.client_id is not distinct from old.client_id
    and new.contact_id is not distinct from old.contact_id
    and not (old.status = 'borrador' and new.status = 'emitida') then
    return new;
  end if;

  select * into c from public.clients where id = new.client_id;
  if new.contact_id is not null then
    select * into k from public.contacts where id = new.contact_id;
    if k.client_id is distinct from new.client_id then
      raise exception 'El contacto no pertenece al cliente de la cotización'
        using errcode = '23514';
    end if;
  end if;

  new.client_name := coalesce(c.display_name, '');
  new.client_document_type := c.document_type;
  new.client_document_number := c.document_number;
  new.client_phone := coalesce(c.phone, c.contact_phone);
  new.client_email := c.email;
  new.client_address := coalesce(c.address, '');
  new.contact_name := k.display_name;
  new.contact_phone := k.phone;
  new.contact_email := k.email;
  return new;
end;
$$;

-- 5. Mensaje de cotización de logística: el teléfono que tenga el cliente.
--    Igual que en 20261030130000, salvo `client_phone`.
create or replace function public.restoration_quote_message_data(p_restoration_id uuid)
returns table (
  client_name text,
  client_document_number text,
  client_phone text,
  contact_name text,
  contact_phone text,
  total numeric,
  deposit_percent numeric,
  deposit_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.display_name, c.document_number, coalesce(c.phone, c.contact_phone),
    k.display_name, k.phone, r.total, r.deposit_percent, r.deposit_amount
  from public.restorations r
  join public.clients c on c.id = r.client_id
  left join public.contacts k on k.id = r.contact_id
  where r.id = p_restoration_id
    and private.current_app_role() is not null
    and (private.has_role('{admin,ventas}') or not private.is_past_restoration(r.id, r.status));
$$;

-- 6. Fusión: si el que se queda no tiene ningún teléfono, se queda con el del duplicado
--    como teléfono de contacto (no va a Shopify, así que no choca con la ficha del
--    duplicado); igual queda anotado en sus notas. Igual que en 20261031130000, salvo
--    `contact_phone` y que la nota también menciona el teléfono de contacto.
create or replace function public.merge_clients(p_keep uuid, p_remove uuid)
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
  v_keep_phone text;
  v_remove_phone text;
  v_inherit_phone text;
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
    -- El vínculo con Shopify pasa al que se queda si no tenía (es la misma persona).
    shopify_customer_id = case when v_keep.shopify_customer_id is null then null
      else shopify_customer_id end,
    notes = left(ltrim(notes || E'\n' || format('Fusionado en %s el %s.', v_keep.display_name, v_today), E'\n'), 2000)
  where id = p_remove;

  v_keep_phone := coalesce(v_keep.phone, v_keep.contact_phone);
  v_remove_phone := coalesce(v_remove.phone, v_remove.contact_phone);
  if v_keep_phone is null then
    v_inherit_phone := v_remove_phone;
  end if;
  v_data := concat_ws(', ',
    case when v_remove_phone is distinct from v_keep_phone then 'tel. ' || v_remove_phone end,
    case when v_remove.email is distinct from v_keep.email then v_remove.email end
  );
  update public.clients
  set document_type = coalesce(v_keep.document_type, v_remove.document_type),
    document_number = coalesce(v_keep.document_number, v_remove.document_number),
    shopify_customer_id = coalesce(v_keep.shopify_customer_id, v_remove.shopify_customer_id),
    contact_phone = coalesce(contact_phone, v_inherit_phone),
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
