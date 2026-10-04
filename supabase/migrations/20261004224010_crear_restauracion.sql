-- Registro transaccional de una restauración con sus piezas (Paso 7.3): todo o nada.
-- Corre con los permisos de quien llama (security invoker): las políticas RLS y los
-- privilegios por columna de 20261004223122_restauraciones.sql deciden quién puede
-- (admin y ventas). Lo obligatorio del formulario se valida en la aplicación
-- (src/lib/validation/restorations.ts); aquí se revisa lo que protege los datos.
--
-- p_pieces: arreglo JSON de objetos con description, price (texto decimal en soles),
-- measure, material_id, material_name, service_id, service_name, weight_grams,
-- workshop_id, arrived (boolean) y notes.
create or replace function public.create_restoration(
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb
)
returns table (id uuid, code text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restoration public.restorations;
  v_piece jsonb;
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

  insert into public.restorations (client_id, contact_id, payment_type, deposit_percent, notes)
  values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, '')
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name,
      service_id, service_name, weight_grams, price, notes, arrived_at
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
      case when coalesce((v_piece ->> 'arrived')::boolean, false) then now() end
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

revoke execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb)
  from public, anon;
grant execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb)
  to authenticated;
