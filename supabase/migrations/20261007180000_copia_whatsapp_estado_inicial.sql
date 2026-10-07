-- "Crear restauración" desde una cotización de WhatsApp (P49): las piezas ya no se
-- aprueban solas. Nacen Registradas y cada una pasa al estado inicial que elige el
-- usuario:
--   * "en_consulta": con nota obligatoria; después sigue el flujo normal
--     (Espera respuesta cliente → Aprobada);
--   * "aprobada": sin nota.
-- La restauración nace Registrada y su estado general se calcula como en oficina:
-- queda Aprobada (y encola la orden de Shopify) cuando todas sus piezas activas
-- están aprobadas.
-- p_pieces: como create_restoration más "quote_item_id" (opcional), "status" y
-- "status_note" por pieza.
create or replace function public.create_restoration_from_whatsapp_quote(
  p_quote_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb
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

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, notes, origin, whatsapp_quote_id
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
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
    if v_status is null or v_status not in ('en_consulta', 'aprobada') then
      raise exception 'Elige el estado inicial de cada pieza.' using errcode = '23514';
    end if;
    v_note := nullif(trim(coalesce(v_piece ->> 'status_note', '')), '');
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
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name,
      service_id, service_name, weight_grams, price, notes, urgent,
      whatsapp_quote_item_id
    ) values (
      v_restoration.id,
      nullif(v_piece ->> 'workshop_id', '')::uuid,
      trim(coalesce(v_piece ->> 'description', '')),
      trim(coalesce(v_piece ->> 'measure', '')),
      nullif(v_piece ->> 'material_id', '')::uuid,
      trim(coalesce(v_piece ->> 'material_name', '')),
      nullif(v_piece ->> 'service_id', '')::uuid,
      trim(coalesce(v_piece ->> 'service_name', '')),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      (v_piece ->> 'price')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item
    )
    returning pieces.id into v_new;
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
