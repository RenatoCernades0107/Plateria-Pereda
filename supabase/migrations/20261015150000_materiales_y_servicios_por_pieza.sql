-- Materiales y servicios de la pieza desde el catálogo (pedido del 2026-10-15).
--   * Al registrar o editar una pieza se elige el servicio y uno o más materiales con un
--     buscador; si no existe, admin y ventas lo crean ahí mismo (ya no se escribe texto
--     libre que no queda en el catálogo).
--   * La pieza guarda sus materiales en `material_ids` (en orden). `material_id` (el
--     primero) y `material_name` (los nombres separados por coma) los mantiene un
--     trigger, así las vistas, listados, PDF y reportes siguen funcionando igual.
--   * Los datos existentes no se pierden: los nombres escritos libremente en piezas y
--     cotizaciones pasan al catálogo y las piezas quedan enlazadas a ellos. Los nombres
--     que ya se guardaron en cada pieza no cambian.

-- 1. Catálogo: crear (o reactivar) un ítem por nombre.
create or replace function private.ensure_catalog_item(p_kind text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Escribe un nombre de hasta 100 caracteres.' using errcode = '22023';
  end if;
  if p_kind = 'materials' then
    insert into public.materials (name) values (v_name)
    on conflict (lower(trim(name))) do nothing;
    select m.id into v_id from public.materials m where lower(trim(m.name)) = lower(v_name);
    update public.materials m set active = true where m.id = v_id and not m.active;
  elsif p_kind = 'services' then
    insert into public.services (name) values (v_name)
    on conflict (lower(trim(name))) do nothing;
    select s.id into v_id from public.services s where lower(trim(s.name)) = lower(v_name);
    update public.services s set active = true where s.id = v_id and not s.active;
  else
    raise exception 'Catálogo inválido' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

revoke execute on function private.ensure_catalog_item(text, text) from public, anon, authenticated;

-- Desde el formulario de la pieza: admin y ventas crean materiales y servicios (sin
-- precio sugerido; ese lo pone el admin en Configuración). Si ya existe (aunque esté
-- desactivado) se reutiliza.
create or replace function public.create_catalog_option(p_kind text, p_name text)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para crear ítems del catálogo' using errcode = '42501';
  end if;
  v_id := private.ensure_catalog_item(p_kind, p_name);
  if p_kind = 'materials' then
    return query select m.id, m.name from public.materials m where m.id = v_id;
  else
    return query select s.id, s.name from public.services s where s.id = v_id;
  end if;
end;
$$;

revoke execute on function public.create_catalog_option(text, text) from public, anon;
grant execute on function public.create_catalog_option(text, text) to authenticated;

-- 2. Varios materiales por pieza (también en las cotizaciones de WhatsApp).
alter table public.pieces
  add column material_ids uuid[] not null default '{}'
    constraint pieces_material_ids_check check (cardinality(material_ids) <= 10);
alter table public.whatsapp_quote_items
  add column material_ids uuid[] not null default '{}'
    constraint whatsapp_quote_items_material_ids_check check (cardinality(material_ids) <= 10);

comment on column public.pieces.material_ids is
  'Materiales de la pieza (catálogo, en orden). material_id y material_name se derivan de aquí.';
comment on column public.whatsapp_quote_items.material_ids is
  'Materiales de la pieza (catálogo, en orden). material_id y material_name se derivan de aquí.';

-- Los nombres juntos ("Plata 950, Alpaca") pueden pasar de 100 caracteres.
alter table public.pieces drop constraint pieces_material_name_check;
alter table public.pieces
  add constraint pieces_material_name_check check (length(material_name) <= 1100);
alter table public.whatsapp_quote_items drop constraint whatsapp_quote_items_material_name_check;
alter table public.whatsapp_quote_items
  add constraint whatsapp_quote_items_material_name_check check (length(material_name) <= 1100);

grant insert (material_ids) on public.pieces to authenticated;
grant update (material_ids) on public.pieces to authenticated;

-- 3. Datos existentes: lo escrito libremente pasa al catálogo (los ítems que ya
--    existen se reutilizan, sin distinguir mayúsculas).
insert into public.materials (name)
select distinct on (lower(trim(n))) trim(n)
from (
  select material_name as n from public.pieces where material_id is null
  union all
  select material_name from public.whatsapp_quote_items where material_id is null
) s
where length(trim(n)) between 1 and 100
order by lower(trim(n)), trim(n)
on conflict (lower(trim(name))) do nothing;

insert into public.services (name)
select distinct on (lower(trim(n))) trim(n)
from (
  select service_name as n from public.pieces where service_id is null
  union all
  select service_name from public.whatsapp_quote_items where service_id is null
) s
where length(trim(n)) between 1 and 100
order by lower(trim(n)), trim(n)
on conflict (lower(trim(name))) do nothing;

-- Se enlazan las piezas sin pasar por sus triggers: es mantenimiento (no es una
-- edición, no va a la auditoría ni a Shopify, y las piezas anuladas o entregadas
-- también se enlazan). Los nombres guardados en cada pieza no cambian.
alter table public.pieces disable trigger user;
alter table public.whatsapp_quote_items disable trigger user;

update public.pieces p set material_id = m.id
from public.materials m
where p.material_id is null and trim(p.material_name) <> ''
  and lower(trim(m.name)) = lower(trim(p.material_name));
update public.pieces p set service_id = s.id
from public.services s
where p.service_id is null and trim(p.service_name) <> ''
  and lower(trim(s.name)) = lower(trim(p.service_name));
update public.pieces set material_ids = array[material_id] where material_id is not null;

update public.whatsapp_quote_items i set material_id = m.id
from public.materials m
where i.material_id is null and trim(i.material_name) <> ''
  and lower(trim(m.name)) = lower(trim(i.material_name));
update public.whatsapp_quote_items i set service_id = s.id
from public.services s
where i.service_id is null and trim(i.service_name) <> ''
  and lower(trim(s.name)) = lower(trim(i.service_name));
update public.whatsapp_quote_items set material_ids = array[material_id]
where material_id is not null;

alter table public.pieces enable trigger user;
alter table public.whatsapp_quote_items enable trigger user;

-- 4. Trigger: enlaza servicio y materiales con el catálogo y deriva los nombres.
--    Al editar, si no cambian los ids se conservan los nombres guardados (aunque el
--    ítem del catálogo se haya renombrado después). Un nombre sin id (clientes
--    antiguos) crea o reutiliza el ítem del catálogo.
create or replace function private.link_piece_catalogs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  -- Servicio.
  if tg_op = 'UPDATE' and new.service_id is not null
     and new.service_id is not distinct from old.service_id then
    new.service_name := old.service_name;
  elsif new.service_id is not null then
    new.service_name := coalesce(
      (select s.name from public.services s where s.id = new.service_id), new.service_name
    );
  elsif trim(new.service_name) <> '' then
    new.service_id := private.ensure_catalog_item('services', new.service_name);
    new.service_name := (select s.name from public.services s where s.id = new.service_id);
  end if;

  -- Materiales.
  if tg_op = 'INSERT' and cardinality(new.material_ids) = 0 then
    if new.material_id is not null then
      new.material_ids := array[new.material_id];
    elsif trim(new.material_name) <> '' then
      new.material_ids := array[private.ensure_catalog_item('materials', new.material_name)];
    end if;
  end if;

  if tg_op = 'UPDATE' and new.material_ids is not distinct from old.material_ids then
    new.material_id := old.material_id;
    new.material_name := old.material_name;
    return new;
  end if;

  -- Sin repetidos, en el orden elegido.
  select coalesce(array_agg(u.id order by u.ord), '{}'::uuid[]) into v_ids
  from (
    select t.id, min(t.ord) as ord
    from unnest(new.material_ids) with ordinality as t(id, ord)
    where t.id is not null
    group by t.id
  ) u;
  if exists (
    select 1 from unnest(v_ids) as t(id)
    where not exists (select 1 from public.materials m where m.id = t.id)
  ) then
    raise exception 'Uno de los materiales no existe' using errcode = '23503';
  end if;

  new.material_ids := v_ids;
  new.material_id := v_ids[1];
  new.material_name := coalesce((
    select string_agg(m.name, ', ' order by t.ord)
    from unnest(v_ids) with ordinality as t(id, ord)
    join public.materials m on m.id = t.id
  ), '');
  return new;
end;
$$;

revoke execute on function private.link_piece_catalogs() from public, anon, authenticated;

-- El nombre hace que corra antes de los guardas (pieces_guard_*), que comparan
-- material y servicio ya derivados.
create trigger pieces_catalogs_link
  before insert or update on public.pieces
  for each row execute function private.link_piece_catalogs();
create trigger whatsapp_quote_items_catalogs_link
  before insert or update on public.whatsapp_quote_items
  for each row execute function private.link_piece_catalogs();

-- 5. Las RPC reciben `material_ids` (lista de ids) en cada pieza.
create or replace function private.uuid_array(p_value jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(t.value::uuid order by t.ord), '{}'::uuid[])
  from jsonb_array_elements_text(
    case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
  ) with ordinality as t(value, ord)
  where t.value <> '';
$$;

grant execute on function private.uuid_array(jsonb) to authenticated;

-- Inserta las piezas de la cotización (mismo formato que create_restoration).
create or replace function private.insert_whatsapp_quote_items(p_quote_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_number integer := 0;
begin
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    v_number := v_number + 1;
    insert into public.whatsapp_quote_items (
      quote_id, number, description, measure, material_id, material_name, material_ids, service_id,
      service_name, weight_grams, price, notes
    ) values (
      p_quote_id,
      v_number,
      trim(coalesce(v_item ->> 'description', '')),
      trim(coalesce(v_item ->> 'measure', '')),
      nullif(v_item ->> 'material_id', '')::uuid,
      trim(coalesce(v_item ->> 'material_name', '')),
      private.uuid_array(v_item -> 'material_ids'),
      nullif(v_item ->> 'service_id', '')::uuid,
      trim(coalesce(v_item ->> 'service_name', '')),
      nullif(v_item ->> 'weight_grams', '')::numeric,
      (v_item ->> 'price')::numeric,
      coalesce(v_item ->> 'notes', '')
    );
  end loop;
end;
$$;


revoke execute on function private.insert_whatsapp_quote_items(uuid, jsonb) from public, anon, authenticated;

create or replace function public.create_restoration(p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_prices_include_igv boolean DEFAULT true, p_deposit_amount numeric DEFAULT NULL)
 returns table(id uuid, code text)
 language plpgsql
 set search_path to ''
as $$
declare
  v_restoration public.restorations;
  v_piece jsonb;
  v_unpriced uuid[];
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para registrar restauraciones' using errcode = '42501';
  end if;
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array'
     or jsonb_array_length(p_pieces) not between 1 and 100 then
    raise exception 'La restauración debe tener entre 1 y 100 piezas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.active) then
    raise exception 'El cliente no existe o está desactivado' using errcode = '23503';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts k where k.id = p_contact_id and k.active
  ) then
    raise exception 'El contacto no existe o está desactivado' using errcode = '23503';
  end if;

  if p_payment_type = 'a_cuenta' and p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'El adelanto no puede ser negativo.' using errcode = '23514';
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes, prices_include_igv
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when p_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, ''),
    coalesce(p_prices_include_igv, true)
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Un precio escrito solo lo acepta el admin (trigger pieces_guard_price).
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, weight_grams, price, notes, urgent
    ) values (
      v_restoration.id,
      nullif(v_piece ->> 'workshop_id', '')::uuid,
      trim(coalesce(v_piece ->> 'description', '')),
      trim(coalesce(v_piece ->> 'measure', '')),
      nullif(v_piece ->> 'material_id', '')::uuid,
      trim(coalesce(v_piece ->> 'material_name', '')),
      private.uuid_array(v_piece -> 'material_ids'),
      nullif(v_piece ->> 'service_id', '')::uuid,
      trim(coalesce(v_piece ->> 'service_name', '')),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      nullif(v_piece ->> 'price', '')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false)
    );
  end loop;

  -- Sin precio de venta la pieza pasa a Consulta para cotizarlo (pedido del 2026-10-14).
  select coalesce(array_agg(p.id order by p.code), '{}'::uuid[]) into v_unpriced
  from public.pieces p
  where p.restoration_id = v_restoration.id and p.price is null;
  if cardinality(v_unpriced) > 0 then
    perform public.change_piece_status(v_unpriced, 'en_consulta', private.unpriced_note());
  end if;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

-- 4. Desde una cotización: la pieza sin precio va a Consulta aunque se eligiera Aprobada.
create or replace function public.create_restoration_from_whatsapp_quote(p_quote_id uuid, p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_prices_include_igv boolean DEFAULT true, p_deposit_amount numeric DEFAULT NULL)
 returns table(id uuid, code text)
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  v_quote public.whatsapp_quotes;
  v_restoration public.restorations;
  v_piece jsonb;
  v_item uuid;
  v_price numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_new uuid;
  v_status text;
  v_note text;
  v_approved uuid[] := '{}'::uuid[];
  v_consult jsonb := '[]'::jsonb;
  v_step jsonb;
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para registrar restauraciones' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'Elige el cliente de la restauración.' using errcode = '23514';
  end if;
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array'
     or jsonb_array_length(p_pieces) not between 1 and 100 then
    raise exception 'La restauración debe tener entre 1 y 100 piezas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.active) then
    raise exception 'El cliente no existe o está desactivado' using errcode = '23503';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts k where k.id = p_contact_id and k.active and k.client_id = p_client_id
  ) then
    raise exception 'El contacto no existe, está desactivado o no es del cliente' using errcode = '23503';
  end if;

  select * into v_quote from public.whatsapp_quotes q where q.id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'La cotización no existe' using errcode = '23503';
  end if;
  if v_quote.status = 'descartada' then
    raise exception 'La cotización está descartada: reábrela para pedir sus piezas.' using errcode = '23514';
  end if;
  if v_quote.client_id is not null and v_quote.client_id <> p_client_id then
    raise exception 'La cotización es de otro cliente.' using errcode = '23514';
  end if;
  if v_quote.client_id is null then
    update public.whatsapp_quotes q
    set client_id = p_client_id, contact_id = p_contact_id
    where q.id = v_quote.id;
  end if;

  if p_payment_type = 'a_cuenta' and p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'El adelanto no puede ser negativo.' using errcode = '23514';
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes, origin, whatsapp_quote_id,
    prices_include_igv
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when p_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, ''),
    'whatsapp',
    v_quote.id,
    coalesce(p_prices_include_igv, true)
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Estado inicial elegido por pieza (P49): Consulta (con nota) o Aprobada.
    v_status := v_piece ->> 'status';
    v_note := nullif(trim(coalesce(v_piece ->> 'status_note', '')), '');
    v_price := nullif(v_piece ->> 'price', '')::numeric;
    -- Sin precio de venta va a Consulta, elija lo que elija (pedido del 2026-10-14).
    if v_price is null then
      v_status := 'en_consulta';
      v_note := coalesce(v_note, private.unpriced_note());
    end if;
    if v_status is null or v_status not in ('en_consulta', 'aprobada') then
      raise exception 'Elige el estado inicial de cada pieza.' using errcode = '23514';
    end if;
    if v_status = 'en_consulta' and v_note is null then
      raise exception 'Escribe una nota para este cambio de estado.' using errcode = '23514';
    end if;
    v_item := nullif(v_piece ->> 'quote_item_id', '')::uuid;
    if v_item is not null then
      if v_item = any (v_seen) then
        raise exception 'Una pieza cotizada se eligió dos veces.' using errcode = '23514';
      end if;
      v_seen := v_seen || v_item;
      if not exists (
        select 1 from public.whatsapp_quote_items i where i.id = v_item and i.quote_id = v_quote.id
      ) then
        raise exception 'La pieza no es de esta cotización.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.pieces p
        where p.whatsapp_quote_item_id = v_item and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
      ) then
        raise exception 'Una de las piezas ya se pidió en otra restauración.' using errcode = '23514';
      end if;
      -- El precio cotizado se conserva aunque copie ventas.
      if exists (
        select 1 from public.whatsapp_quote_items i where i.id = v_item and i.price = v_price
      ) then
        perform set_config('app.quote_copy_price', 'on', true);
      end if;
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, weight_grams, price, notes, urgent,
      whatsapp_quote_item_id
    ) values (
      v_restoration.id,
      nullif(v_piece ->> 'workshop_id', '')::uuid,
      trim(coalesce(v_piece ->> 'description', '')),
      trim(coalesce(v_piece ->> 'measure', '')),
      nullif(v_piece ->> 'material_id', '')::uuid,
      trim(coalesce(v_piece ->> 'material_name', '')),
      private.uuid_array(v_piece -> 'material_ids'),
      nullif(v_piece ->> 'service_id', '')::uuid,
      trim(coalesce(v_piece ->> 'service_name', '')),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      v_price,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item
    )
    returning pieces.id into v_new;
    perform set_config('app.quote_copy_price', '', true);
    if v_status = 'aprobada' then
      v_approved := v_approved || v_new;
    else
      v_consult := v_consult || jsonb_build_object('id', v_new, 'note', v_note);
    end if;
  end loop;

  -- Cada pieza pasa al estado elegido (P49). La nota es por pieza y
  -- change_piece_status aplica una sola nota por llamada.
  if cardinality(v_approved) > 0 then
    perform public.change_piece_status(v_approved, 'aprobada');
  end if;
  for v_step in select value from jsonb_array_elements(v_consult)
  loop
    perform public.change_piece_status(
      array[(v_step ->> 'id')::uuid], 'en_consulta', v_step ->> 'note'
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

-- 6. La vista operativa expone los materiales elegidos (para editar la pieza).
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at, p.material_ids
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );
