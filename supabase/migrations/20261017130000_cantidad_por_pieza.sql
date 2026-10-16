-- Cantidad por pieza (pedido del 2026-10-17): una línea puede ser "6 cucharitas".
-- Es informativa: el precio y el costo de servicio son de la línea completa (no se
-- multiplican) y la orden de Shopify sigue llevando cantidad 1 por pieza.

-- 1. Columnas.
alter table public.pieces
  add column quantity integer not null default 1
    constraint pieces_quantity_check check (quantity between 1 and 999);
comment on column public.pieces.quantity is
  'Cantidad de unidades de la pieza (informativa: precio y costo son de la pieza completa).';

alter table public.whatsapp_quote_items
  add column quantity integer not null default 1
    constraint whatsapp_quote_items_quantity_check check (quantity between 1 and 999);
comment on column public.whatsapp_quote_items.quantity is
  'Cantidad de unidades (informativa: el precio es de la línea completa).';

-- La app agrega y edita piezas directamente (con RLS): la cantidad se puede escribir.
grant insert (quantity), update (quantity) on public.pieces to authenticated;

-- Como los demás datos de la pieza: no se edita en una pieza cerrada ni entregada.
create or replace function private.guard_piece_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('anulada', 'rechazada', 'sin_arreglo') and (
    new.description, new.measure, new.material_id, new.material_name, new.service_id,
    new.service_name, new.weight_grams, new.price, new.workshop_id, new.notes, new.urgent,
    new.quantity
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.price, old.workshop_id, old.notes, old.urgent,
    old.quantity
  ) then
    raise exception 'Una pieza anulada, rechazada o sin arreglo no se puede editar'
      using errcode = '23514';
  end if;

  if old.status = 'entregada' and (
    new.description, new.measure, new.material_id, new.material_name, new.service_id,
    new.service_name, new.weight_grams, new.workshop_id, new.urgent, new.quantity
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.workshop_id, old.urgent, old.quantity
  ) then
    raise exception 'De una pieza entregada solo se editan las notas' using errcode = '23514';
  end if;

  if old.status = 'entregada' and old.price is not null
     and new.price is distinct from old.price then
    raise exception 'De una pieza entregada solo se editan las notas' using errcode = '23514';
  end if;

  if new.price is distinct from old.price and old.price is not null
     and coalesce(current_setting('app.shopify_order_edit', true), '') <> 'on'
     and exists (
       select 1 from public.restorations
       where id = new.restoration_id and shopify_order_id is not null
     ) then
    raise exception 'Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Valor del JSON de una pieza: entero entre 1 y 999; vacío o ausente, 1.
create or replace function private.piece_quantity(p_value jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(trim(coalesce(p_value #>> '{}', '')), '');
  v_quantity integer;
begin
  if v_text is null then
    return 1;
  end if;
  begin
    v_quantity := v_text::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'La cantidad debe ser un número entero entre 1 y 999.' using errcode = '22023';
  end;
  if v_quantity not between 1 and 999 then
    raise exception 'La cantidad debe ser un número entero entre 1 y 999.' using errcode = '22023';
  end if;
  return v_quantity;
end;
$$;

revoke execute on function private.piece_quantity(jsonb) from public, anon;
grant execute on function private.piece_quantity(jsonb) to authenticated, service_role;

-- 2. La vista operativa expone la cantidad.
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at, p.material_ids,
  p.observed_at, p.quantity
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

-- 3. Cotización de WhatsApp: cada pieza cotizada guarda su cantidad (crear y editar
-- usan esta función).
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
      service_name, weight_grams, price, notes, quantity
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
      coalesce(v_item ->> 'notes', ''),
      private.piece_quantity(v_item -> 'quantity')
    );
  end loop;
end;
$$;

-- 4. Restauración desde la cotización de WhatsApp: la pieza copia la cantidad (la del
-- formulario o, si no viene, la de la pieza cotizada).
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
      service_id, service_name, weight_grams, price, notes, urgent,
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
