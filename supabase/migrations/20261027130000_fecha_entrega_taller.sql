-- Dos fechas por pieza urgente (pedido del 2026-10-27): la fecha estimada de entrega al
-- cliente (`estimated_delivery_date`, obligatoria) y la fecha estimada de entrega del
-- taller (`workshop_delivery_date`, por defecto 3 días antes de la del cliente). La del
-- taller no es posterior a la del cliente. Se ingresan al marcar la pieza urgente y se
-- pueden cambiar después; la del taller solo la cambian admin y logística.

-- 1. Columna.
alter table public.pieces add column workshop_delivery_date date;
comment on column public.pieces.workshop_delivery_date is
  'Fecha estimada en que el taller entrega la pieza. Solo en piezas urgentes y nunca posterior a la fecha de entrega al cliente. Si no se indica, queda 3 días antes de la del cliente (sin pasar de hoy).';
grant insert (workshop_delivery_date), update (workshop_delivery_date) on public.pieces to authenticated;

-- 2. Regla (reemplaza a la de 20261027110000). Sin urgencia no hay fechas. La fecha al
--    cliente es obligatoria (salvo en las urgentes de antes que aún no la tienen). Las
--    fechas nuevas no pueden ser anteriores a hoy (hora de Lima). La del taller no es
--    posterior a la del cliente y, si no se indica al marcar la pieza urgente (o al
--    ponerle por primera vez la fecha del cliente), queda 3 días antes de la del cliente,
--    sin pasar de hoy. Si la fecha del cliente se adelanta por delante de la del taller
--    (y no se tocó la del taller), la del taller se vuelve a calcular. Ventas no cambia la
--    fecha del taller (admin y logística sí; sin sesión, como `service_role`, también).
--    Las piezas cerradas o entregadas no cambian sus fechas.
--
--    `security definer`: el trigger corre con los permisos de quien escribe, y
--    `service_role` (sincronizaciones, scripts) no ve el esquema `private`.
create or replace function private.guard_piece_urgent_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Lima')::date;
  v_role public.app_role := private.current_app_role();
  v_old_workshop date := case when tg_op = 'UPDATE' then old.workshop_delivery_date end;
begin
  if tg_op = 'UPDATE'
     and old.status in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
     and (new.estimated_delivery_date, new.workshop_delivery_date)
       is distinct from (old.estimated_delivery_date, old.workshop_delivery_date) then
    raise exception 'De una pieza cerrada o entregada no se cambian las fechas estimadas de entrega'
      using errcode = '23514';
  end if;

  if not new.urgent then
    new.estimated_delivery_date := null;
    new.workshop_delivery_date := null;
    return new;
  end if;

  if v_role = 'ventas' and new.workshop_delivery_date is distinct from v_old_workshop then
    raise exception 'Solo administración y logística cambian la fecha de entrega del taller.'
      using errcode = '42501';
  end if;

  if new.estimated_delivery_date is null
     and (tg_op = 'INSERT' or not old.urgent or old.estimated_delivery_date is not null) then
    raise exception 'Una pieza urgente necesita fecha estimada de entrega.'
      using errcode = '23514';
  end if;

  if new.estimated_delivery_date is not null
     and (tg_op = 'INSERT' or new.estimated_delivery_date is distinct from old.estimated_delivery_date)
     and new.estimated_delivery_date < v_today then
    raise exception 'La fecha estimada de entrega no puede ser anterior a hoy.'
      using errcode = '23514';
  end if;

  -- Fecha del taller por defecto: 3 días antes de la del cliente, sin pasar de hoy.
  if new.estimated_delivery_date is not null and new.workshop_delivery_date is null
     and (tg_op = 'INSERT' or not old.urgent or old.estimated_delivery_date is null) then
    new.workshop_delivery_date := greatest(new.estimated_delivery_date - 3, v_today);
  end if;

  -- La fecha del cliente se adelantó por delante de la del taller (que no se tocó): se
  -- recalcula en vez de fallar, para quien no puede cambiar la del taller.
  if tg_op = 'UPDATE' and new.estimated_delivery_date is not null
     and new.estimated_delivery_date is distinct from old.estimated_delivery_date
     and new.workshop_delivery_date is not distinct from old.workshop_delivery_date
     and new.workshop_delivery_date > new.estimated_delivery_date then
    new.workshop_delivery_date := greatest(new.estimated_delivery_date - 3, v_today);
  end if;

  if new.workshop_delivery_date is not null
     and (tg_op = 'INSERT' or new.workshop_delivery_date is distinct from old.workshop_delivery_date)
     and new.workshop_delivery_date < v_today then
    raise exception 'La fecha de entrega del taller no puede ser anterior a hoy.'
      using errcode = '23514';
  end if;

  if new.workshop_delivery_date is not null and new.estimated_delivery_date is not null
     and new.workshop_delivery_date > new.estimated_delivery_date then
    raise exception 'La fecha de entrega del taller no puede ser posterior a la del cliente.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 3. La vista operativa expone la fecha del taller (al final).
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at, p.material_ids,
  p.observed_at, p.quantity, p.service_ids,
  case when (select private.has_role('{admin,ventas,logistica}')) then p.price end as price,
  p.estimated_delivery_date, p.workshop_delivery_date
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

comment on view public.pieces_operational is
  'Piezas con el precio de venta de cada una, sin totales ni pagos (P42). Logística no ve las de restauraciones pasadas (D24, P48).';

-- 4. Registrar una guía y copiar una cotización de WhatsApp: cada pieza trae también la
--    fecha del taller (`workshop_delivery_date` en el JSON).
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
      whatsapp_quote_item_id, quantity, estimated_delivery_date, workshop_delivery_date
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
      coalesce(v_quantity, 1),
      nullif(v_piece ->> 'estimated_delivery_date', '')::date,
      nullif(v_piece ->> 'workshop_delivery_date', '')::date
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
      service_id, service_name, service_ids, weight_grams, price, notes, urgent, quantity,
      estimated_delivery_date, workshop_delivery_date
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
      private.piece_quantity(v_piece -> 'quantity'),
      nullif(v_piece ->> 'estimated_delivery_date', '')::date,
      nullif(v_piece ->> 'workshop_delivery_date', '')::date
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


-- 5. Marcar urgente o cambiar las fechas. Al marcar, la fecha al cliente es obligatoria;
--    la del taller, opcional. Sobre piezas que ya son urgentes, la misma llamada coloca o
--    cambia las fechas. `p_keep_workshop_date`: con la fecha del taller en blanco, cada
--    pieza conserva la que tenga (cambio en bloque, y siempre para ventas); sin él, en
--    blanco la borra (y una pieza que se marca ahora recibe la de por defecto). Al quitar
--    la marca, las dos fechas se borran.
drop function public.set_pieces_urgent(uuid[], boolean, date);

create function public.set_pieces_urgent(
  p_piece_ids uuid[],
  p_urgent boolean,
  p_estimated_delivery_date date default null,
  p_workshop_delivery_date date default null,
  p_keep_workshop_date boolean default false
)
returns table (piece_id uuid, urgent boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_found integer;
  v_open integer;
  v_date date := case when p_urgent then p_estimated_delivery_date end;
  v_keep boolean := coalesce(p_keep_workshop_date, false) and p_workshop_delivery_date is null;
begin
  if v_role is null or v_role not in ('admin', 'ventas', 'logistica') then
    raise exception 'Tu rol no puede marcar piezas como urgentes.' using errcode = '42501';
  end if;
  if p_piece_ids is null or cardinality(p_piece_ids) = 0 then
    raise exception 'Elige al menos una pieza' using errcode = '22023';
  end if;
  if p_urgent is null then
    raise exception 'Indica si la pieza es urgente' using errcode = '22023';
  end if;
  if p_urgent and p_estimated_delivery_date is null then
    raise exception 'Indica la fecha estimada de entrega de la pieza urgente.' using errcode = '22023';
  end if;

  if v_role = 'logistica' and exists (
    select 1 from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where p.id = any (p_piece_ids) and private.is_past_restoration(r.id, r.status)
  ) then
    raise exception 'Tu rol no puede marcar piezas de restauraciones pasadas.' using errcode = '42501';
  end if;

  select count(*), count(*) filter (
      where p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
    )
  into v_found, v_open
  from public.pieces p
  where p.id = any (p_piece_ids);
  if v_found = 0 then
    raise exception 'Las piezas no existen' using errcode = '23503';
  end if;
  if v_open = 0 then
    raise exception 'Una pieza cerrada o entregada no se marca como urgente.' using errcode = '23514';
  end if;

  -- Por la tabla: guards, `updated_at` y auditoría siguen aplicando.
  update public.pieces p
  set urgent = p_urgent,
    estimated_delivery_date = v_date,
    workshop_delivery_date = case
      when not p_urgent then null
      when v_keep then p.workshop_delivery_date
      else p_workshop_delivery_date
    end
  where p.id = any (p_piece_ids)
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
    and (
      p.urgent is distinct from p_urgent
      or p.estimated_delivery_date is distinct from v_date
      or (p_urgent and not v_keep and p.workshop_delivery_date is distinct from p_workshop_delivery_date)
    );

  return query
  select p.id, p.urgent
  from public.pieces p
  where p.id = any (p_piece_ids)
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
  order by p.id;
end;
$$;

revoke execute on function public.set_pieces_urgent(uuid[], boolean, date, date, boolean) from public, anon;
grant execute on function public.set_pieces_urgent(uuid[], boolean, date, date, boolean) to authenticated;

-- 6. Vista de piezas: devuelve también la fecha del taller (antes de `total_count`).
drop function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text);

create function public.list_pieces_board(
  p_query text default null,
  p_location public.piece_location default null,
  p_status public.piece_status default null,
  p_workshop_id uuid default null,
  p_min_workshop_days integer default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_urgent boolean default false,
  p_ready boolean default false,
  p_to_return boolean default false,
  p_restoration_code text default null,
  p_no_workshop boolean default false,
  p_sort text default 'guia',
  p_dir text default 'desc'
)
returns table (
  id uuid,
  code text,
  restoration_id uuid,
  restoration_code text,
  client_name text,
  description text,
  service_name text,
  material_name text,
  measure text,
  weight_grams numeric,
  status public.piece_status,
  location public.piece_location,
  urgent boolean,
  ready_for_delivery boolean,
  workshop_id uuid,
  workshop_name text,
  arrived_at timestamptz,
  workshop_days integer,
  workshop_ongoing boolean,
  last_observation text,
  service_cost numeric,
  price numeric,
  has_order boolean,
  photo_path text,
  review_sent_at timestamptz,
  review_returned_at timestamptz,
  quantity integer,
  location_since timestamptz,
  observed_at timestamptz,
  last_sent_at timestamptz,
  last_returned_at timestamptz,
  first_sent_at timestamptz,
  to_return boolean,
  estimated_delivery_date date,
  workshop_delivery_date date,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with pieces_today as (
    select p.*,
      -- Entregada (o devuelta al cliente) hoy, en hora de Lima.
      (
        (p.status = 'entregada' and p.delivered_at is not null
          and (p.delivered_at at time zone 'America/Lima')::date = private.lima_today())
        or (p.status in ('rechazada', 'sin_arreglo') and p.returned_at is not null
          and (p.returned_at at time zone 'America/Lima')::date = private.lima_today())
      ) as finished_today,
      (p.status in ('rechazada', 'sin_arreglo') and p.location in ('sin_enviar', 'en_tienda')) as to_return
    from public.pieces p
  ),
  base as (
    select p.*, r.code as restoration_code, r.created_at as restoration_created_at,
      c.display_name as client_name, w.name as workshop_name,
      r.shopify_order_id is not null as has_order
    from pieces_today p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      and p.status <> 'anulada'
      and (p.status <> 'entregada' or p.finished_today)
      and (
        not (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
        or p.finished_today
      )
      and (
        not private.is_past_restoration(r.id, r.status)
        or (p.finished_today and private.has_role('{admin,ventas}'))
      )
      and (p_location is null or p.location = p_location)
      and (p_status is null or p.status = p_status)
      and (p_workshop_id is null or p.workshop_id = p_workshop_id)
      and (not coalesce(p_no_workshop, false) or p.workshop_id is null)
      and (not coalesce(p_urgent, false) or p.urgent)
      -- Listas: para entregar o para devolver al cliente.
      and (not coalesce(p_ready, false) or p.ready_for_delivery or p.to_return)
      and (not coalesce(p_to_return, false) or p.to_return)
      and (
        nullif(trim(p_query), '') is null
        or p.code ilike '%' || trim(p_query) || '%'
        or p.description ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
      )
      and (
        nullif(regexp_replace(coalesce(p_restoration_code, ''), '\D', '', 'g'), '') is null
        or ltrim(regexp_replace(r.code, '\D', '', 'g'), '0')
          = ltrim(regexp_replace(p_restoration_code, '\D', '', 'g'), '0')
      )
  ),
  enriched as (
    select b.*, w.days as workshop_days, w.ongoing as workshop_ongoing,
      (select h.note from public.piece_status_history h
       where h.piece_id = b.id and h.event = 'estado' and h.to_status = 'observada'
       order by h.occurred_at desc, h.id desc limit 1) as last_observation
    from base b
    cross join lateral public.workshop_days(private.piece_history_json(b.id), now()) w
  )
  select e.id, e.code, e.restoration_id, e.restoration_code, e.client_name, e.description,
    e.service_name, e.material_name, e.measure, e.weight_grams,
    e.status, e.location, e.urgent, e.ready_for_delivery, e.workshop_id, e.workshop_name,
    e.arrived_at, e.workshop_days, e.workshop_ongoing, e.last_observation,
    case when private.has_role('{admin,logistica}') then e.service_cost end,
    case when private.has_role('{admin,ventas,logistica}') then e.price end,
    e.has_order,
    (select f.path from public.restoration_files f
     where f.piece_id = e.id and f.category = 'antes'
       and f.mime_type in ('image/jpeg', 'image/png', 'image/webp')
     order by f.created_at, f.id limit 1),
    e.review_sent_at, e.review_returned_at,
    e.quantity,
    public.piece_location_since(e.location, e.status, e.created_at, e.arrived_at, e.observed_at,
      e.last_sent_at, e.last_returned_at, e.review_sent_at, e.review_returned_at, e.delivered_at,
      e.returned_at, e.cancelled_at),
    e.observed_at, e.last_sent_at, e.last_returned_at, e.first_sent_at,
    e.to_return,
    e.estimated_delivery_date,
    e.workshop_delivery_date,
    count(*) over ()
  from enriched e
  cross join lateral (
    select
      case when p_sort in ('guia', 'fecha', 'precio', 'dias_taller') then p_sort else 'guia' end as s,
      case when p_dir = 'asc' then 'asc' else 'desc' end as d,
      private.has_role('{admin,ventas,logistica}') as sees_price
  ) o
  where p_min_workshop_days is null or e.workshop_days >= p_min_workshop_days
  -- Las entregadas hoy, al final: ya no requieren trabajo. Luego, el orden elegido.
  order by e.finished_today,
    -- Guía: la más reciente (o la más antigua) y sus piezas en orden.
    case when o.s = 'guia' and o.d = 'asc' then e.restoration_created_at end asc,
    case when o.s = 'guia' and o.d = 'desc' then e.restoration_created_at end desc,
    case when o.s = 'guia' then e.number end asc,
    case when o.s = 'fecha' and o.d = 'asc' then e.created_at end asc,
    case when o.s = 'fecha' and o.d = 'desc' then e.created_at end desc,
    -- Precio: las que no tienen, al final.
    case when o.s = 'precio' and o.sees_price and o.d = 'asc' then e.price end asc nulls last,
    case when o.s = 'precio' and o.sees_price and o.d = 'desc' then e.price end desc nulls last,
    -- Días en taller: primero las que siguen en el taller.
    case when o.s = 'dias_taller' then e.workshop_ongoing end desc,
    case when o.s = 'dias_taller' and o.d = 'asc' then e.workshop_days end asc,
    case when o.s = 'dias_taller' and o.d = 'desc' then e.workshop_days end desc,
    e.created_at, e.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text) to authenticated;
