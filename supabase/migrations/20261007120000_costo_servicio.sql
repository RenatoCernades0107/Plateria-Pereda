-- Costo de servicio de la pieza: lo que el taller cobra por el arreglo. Es opcional al
-- registrar la pieza y se completa después; solo admin y logística lo cambian, por el
-- RPC `set_piece_service_cost` (ni el insert ni el update de la tabla lo incluyen).
alter table public.pieces
  add column service_cost numeric(12, 2) check (service_cost >= 0);

comment on column public.pieces.service_cost is
  'Lo que el taller cobra por el servicio de esta pieza (soles). Null = aún sin definir.';

create or replace function public.set_piece_service_cost(p_piece_id uuid, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Tu rol no puede cambiar el costo de servicio.' using errcode = '42501';
  end if;
  if p_cost is not null and (p_cost < 0 or p_cost >= 100000000000) then
    raise exception 'El costo de servicio no es válido.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.pieces p join public.restorations r on r.id = p.restoration_id
    where p.id = p_piece_id
      and p.status <> 'anulada'
      and ((select private.has_role('{admin}')) or not private.is_past_restoration(r.id, r.status))
  ) then
    raise exception 'La pieza no existe o ya no se puede editar.' using errcode = '23514';
  end if;

  update public.pieces set service_cost = round(p_cost, 2)
  where id = p_piece_id and service_cost is distinct from round(p_cost, 2);
end;
$$;

revoke execute on function public.set_piece_service_cost(uuid, numeric) from public, anon;
grant execute on function public.set_piece_service_cost(uuid, numeric) to authenticated;

-- Piezas asignadas a un taller que aún no volvieron al cliente: la tabla que se le
-- envía al proveedor. Paginada; `total_cost` suma el costo de todas las filas del
-- taller (no solo de la página).
create or replace function public.list_workshop_pieces(
  p_workshop_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  restoration_id uuid,
  restoration_code text,
  status public.piece_status,
  code text,
  description text,
  service_name text,
  measure text,
  material_name text,
  weight_grams numeric,
  service_cost numeric,
  total_cost numeric,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Tu rol no puede ver las piezas de un taller.' using errcode = '42501';
  end if;
  return query
  select p.id, p.restoration_id, r.code, p.status, p.code, p.description, p.service_name,
    p.measure, p.material_name, p.weight_grams, p.service_cost,
    coalesce(sum(p.service_cost) over (), 0), count(*) over ()
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.workshop_id = p_workshop_id
    and p.status in ('registrada', 'en_consulta', 'en_espera', 'aprobada', 'enviada_taller', 'observada')
    and not private.is_past_restoration(r.id, r.status)
  order by r.code, p.number
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_workshop_pieces(uuid, integer, integer) from public, anon;
grant execute on function public.list_workshop_pieces(uuid, integer, integer) to authenticated;
