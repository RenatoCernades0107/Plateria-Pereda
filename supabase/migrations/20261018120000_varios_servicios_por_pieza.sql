-- Varios servicios por pieza (pedido del 2026-10-18).
--   * Al registrar o editar una pieza se eligen uno o más servicios del catálogo, como ya
--     se hace con los materiales.
--   * La pieza guarda sus servicios en `service_ids` (en orden). `service_id` (el primero)
--     y `service_name` (los nombres separados por coma) los mantiene un trigger, así las
--     vistas, listados, PDF y reportes siguen funcionando igual.
--   * Los datos existentes no cambian: cada pieza con servicio queda con ese único
--     servicio y los nombres ya guardados no se tocan.

-- 1. Columnas (piezas y piezas de cotizaciones de WhatsApp).
alter table public.pieces
  add column service_ids uuid[] not null default '{}'
    constraint pieces_service_ids_check check (cardinality(service_ids) <= 10);
alter table public.whatsapp_quote_items
  add column service_ids uuid[] not null default '{}'
    constraint whatsapp_quote_items_service_ids_check check (cardinality(service_ids) <= 10);

comment on column public.pieces.service_ids is
  'Servicios de la pieza (catálogo, en orden). service_id y service_name se derivan de aquí.';
comment on column public.whatsapp_quote_items.service_ids is
  'Servicios de la pieza (catálogo, en orden). service_id y service_name se derivan de aquí.';

-- Los nombres juntos ("Pulido, Limpieza") pueden pasar de 100 caracteres.
alter table public.pieces drop constraint pieces_service_name_check;
alter table public.pieces
  add constraint pieces_service_name_check check (length(service_name) <= 1100);
alter table public.whatsapp_quote_items drop constraint whatsapp_quote_items_service_name_check;
alter table public.whatsapp_quote_items
  add constraint whatsapp_quote_items_service_name_check check (length(service_name) <= 1100);

-- La app agrega y edita piezas directamente (con RLS): los servicios se pueden escribir.
grant insert (service_ids), update (service_ids) on public.pieces to authenticated;

-- 2. Datos existentes: cada pieza con servicio queda con ese único servicio. Es
--    mantenimiento (no es una edición): sin pasar por los triggers de la pieza, así no va
--    a la auditoría ni a Shopify y también se enlazan las anuladas o entregadas.
alter table public.pieces disable trigger user;
alter table public.whatsapp_quote_items disable trigger user;
update public.pieces set service_ids = array[service_id] where service_id is not null;
update public.whatsapp_quote_items set service_ids = array[service_id] where service_id is not null;
alter table public.pieces enable trigger user;
alter table public.whatsapp_quote_items enable trigger user;

-- 3. Un servicio en uso no se borra: ahora también cuenta `service_ids` (arreglo sin FK).
create or replace function private.block_catalog_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pieces integer;
  v_quotes integer;
  v_uses text[] := '{}';
begin
  if tg_argv[0] = 'services' then
    select count(*) into v_pieces from public.pieces
      where service_id = old.id or old.id = any (service_ids);
    select count(*) into v_quotes from public.whatsapp_quote_items
      where service_id = old.id or old.id = any (service_ids);
  else
    select count(*) into v_pieces from public.pieces
      where material_id = old.id or old.id = any (material_ids);
    select count(*) into v_quotes from public.whatsapp_quote_items
      where material_id = old.id or old.id = any (material_ids);
  end if;

  if v_pieces > 0 then
    v_uses := v_uses || (v_pieces || case when v_pieces = 1 then ' pieza' else ' piezas' end);
  end if;
  if v_quotes > 0 then
    v_uses := v_uses || (v_quotes || case when v_quotes = 1
      then ' cotización de WhatsApp' else ' cotizaciones de WhatsApp' end);
  end if;
  if cardinality(v_uses) > 0 then
    raise exception '“%” está en uso en %. Desactívalo en su lugar.',
      old.name, array_to_string(v_uses, ' y ')
      using errcode = '23503';
  end if;
  return old;
end;
$$;

-- 4. Trigger: enlaza servicios y materiales con el catálogo y deriva los nombres. Al
--    editar, si no cambian los ids se conservan los nombres guardados (aunque el ítem
--    del catálogo se haya renombrado después). Un solo `service_id` o un nombre sin id
--    (clientes antiguos) se enlaza con un ítem activo que exista, o se rechaza.
create or replace function private.link_piece_catalogs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_name text;
begin
  -- Servicios.
  if tg_op = 'INSERT' and cardinality(new.service_ids) = 0 then
    if new.service_id is not null then
      new.service_ids := array[new.service_id];
    elsif trim(new.service_name) <> '' then
      v_name := regexp_replace(trim(new.service_name), '\s+', ' ', 'g');
      select array[s.id] into new.service_ids
      from public.services s
      where s.active and lower(trim(s.name)) = lower(v_name);
      if new.service_ids is null then
        raise exception 'El servicio “%” no existe en el catálogo.', v_name using errcode = '23503';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.service_ids is not distinct from old.service_ids then
    new.service_id := old.service_id;
    new.service_name := old.service_name;
  else
    -- Sin repetidos, en el orden elegido.
    select coalesce(array_agg(u.id order by u.ord), '{}'::uuid[]) into v_ids
    from (
      select t.id, min(t.ord) as ord
      from unnest(new.service_ids) with ordinality as t(id, ord)
      where t.id is not null
      group by t.id
    ) u;
    if exists (
      select 1 from unnest(v_ids) as t(id)
      where not exists (select 1 from public.services s where s.id = t.id)
    ) then
      raise exception 'Uno de los servicios no existe' using errcode = '23503';
    end if;

    new.service_ids := v_ids;
    new.service_id := v_ids[1];
    new.service_name := coalesce((
      select string_agg(s.name, ', ' order by t.ord)
      from unnest(v_ids) with ordinality as t(id, ord)
      join public.services s on s.id = t.id
    ), '');
  end if;

  -- Materiales.
  if tg_op = 'INSERT' and cardinality(new.material_ids) = 0 then
    if new.material_id is not null then
      new.material_ids := array[new.material_id];
    elsif trim(new.material_name) <> '' then
      v_name := regexp_replace(trim(new.material_name), '\s+', ' ', 'g');
      select array[m.id] into new.material_ids
      from public.materials m
      where m.active and lower(trim(m.name)) = lower(v_name);
      if new.material_ids is null then
        raise exception 'El material “%” no existe en el catálogo.', v_name using errcode = '23503';
      end if;
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

-- 5. La vista operativa expone los servicios.
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at, p.material_ids,
  p.observed_at, p.quantity, p.service_ids
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

-- 6. Las RPC reciben `service_ids` (lista de ids) en cada pieza. Sin ella, `service_id` o
--    `service_name` siguen funcionando (el trigger los convierte).
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
      service_name, service_ids, weight_grams, price, notes, quantity
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
      private.uuid_array(v_item -> 'service_ids'),
      nullif(v_item ->> 'weight_grams', '')::numeric,
      (v_item ->> 'price')::numeric,
      coalesce(v_item ->> 'notes', ''),
      private.piece_quantity(v_item -> 'quantity')
    );
  end loop;
end;
$$;

create or replace function public.create_restoration_from_whatsapp_quote(
  p_quote_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb,
  p_deposit_amount numeric default null
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.whatsapp_quotes;
  v_restoration public.restorations;
  v_piece jsonb;
  v_item uuid;
  v_price numeric;
  v_quantity integer;
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
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes, origin, whatsapp_quote_id
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when p_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, ''),
    'whatsapp',
    v_quote.id
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
    v_quantity := null;
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
      select i.quantity into v_quantity from public.whatsapp_quote_items i where i.id = v_item;
    end if;
    if nullif(trim(coalesce(v_piece ->> 'quantity', '')), '') is not null then
      v_quantity := private.piece_quantity(v_piece -> 'quantity');
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, service_ids, weight_grams, price, notes, urgent,
      whatsapp_quote_item_id, quantity
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
      private.uuid_array(v_piece -> 'service_ids'),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      v_price,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item,
      coalesce(v_quantity, 1)
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

create or replace function public.create_restoration(
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb,
  p_deposit_amount numeric default null,
  p_kind public.restoration_kind default 'normal'
)
returns table (id uuid, code text)
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.restoration_kind := coalesce(p_kind, 'normal');
  v_payment_type public.payment_type :=
    case when coalesce(p_kind, 'normal') = 'normal' then p_payment_type else 'sin_definir' end;
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

  if v_payment_type = 'a_cuenta' and p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'El adelanto no puede ser negativo.' using errcode = '23514';
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes, kind
  ) values (
    p_client_id,
    p_contact_id,
    v_payment_type,
    case when v_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when v_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, ''),
    v_kind
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Un precio escrito solo lo acepta el admin (trigger pieces_guard_price). El estado
    -- inicial según el tipo lo pone el trigger pieces_apply_kind.
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, service_ids, weight_grams, price, notes, urgent, quantity
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
      private.uuid_array(v_piece -> 'service_ids'),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      case when v_kind = 'normal' then nullif(v_piece ->> 'price', '')::numeric end,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      private.piece_quantity(v_piece -> 'quantity')
    );
  end loop;

  -- Sin precio de venta la pieza pasa a Consulta para cotizarlo (pedido del 2026-10-14).
  -- Las guías internas u observadas no se cotizan.
  if v_kind = 'normal' then
    select coalesce(array_agg(p.id order by p.code), '{}'::uuid[]) into v_unpriced
    from public.pieces p
    where p.restoration_id = v_restoration.id and p.price is null;
    if cardinality(v_unpriced) > 0 then
      perform public.change_piece_status(v_unpriced, 'en_consulta', private.unpriced_note());
    end if;
  end if;

  return query select v_restoration.id, v_restoration.code;
end;
$$;
