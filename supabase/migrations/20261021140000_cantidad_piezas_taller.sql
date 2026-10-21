-- Piezas de un taller con su cantidad (pedido del 2026-10-21: en todo lugar donde salen
-- las piezas se ve cuántas son). Cambia el tipo que devuelve, así que se recrea.
drop function if exists public.list_workshop_pieces(uuid, integer, integer);

create function public.list_workshop_pieces(
  p_workshop_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, restoration_id uuid, restoration_code text, status public.piece_status, code text,
  quantity integer, description text, service_name text, measure text, material_name text,
  weight_grams numeric, service_cost numeric, total_cost numeric, total_count bigint
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
  select p.id, p.restoration_id, r.code, p.status, p.code, p.quantity, p.description,
    p.service_name, p.measure, p.material_name, p.weight_grams, p.service_cost,
    coalesce(sum(p.service_cost) over (), 0), count(*) over ()
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.workshop_id = p_workshop_id
    and p.status in ('registrada', 'en_consulta', 'en_espera', 'aprobada', 'observada')
    and not private.is_past_restoration(r.id, r.status)
  order by r.code, p.number
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_workshop_pieces(uuid, integer, integer) from public, anon;
grant execute on function public.list_workshop_pieces(uuid, integer, integer) to authenticated;
