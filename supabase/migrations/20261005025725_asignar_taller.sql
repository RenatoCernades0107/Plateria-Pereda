-- Asignar o cambiar el taller de una o varias piezas (Paso 8.4). Lo hacen admin,
-- ventas y logística (piezas.asignar-taller); logística no puede editar piezas, así
-- que va por este RPC. Queda en la auditoría. No cambia el estado: una pieza que ya
-- está en el taller no cambia de taller (se devuelve y se reenvía).
create or replace function public.assign_piece_workshop(p_piece_ids uuid[], p_workshop_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (select private.has_role('{admin,ventas,logistica}')) then
    raise exception 'Tu rol no puede asignar talleres.' using errcode = '42501';
  end if;
  if p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.pieces p
    where p.id = any (p_piece_ids) and p.status in ('enviada_taller', 'entregada', 'anulada')
  ) then
    raise exception 'No se cambia el taller de una pieza que está en el taller, entregada o anulada.'
      using errcode = '23514';
  end if;
  if (select private.has_role('{logistica}')) and exists (
    select 1 from public.pieces p join public.restorations r on r.id = p.restoration_id
    where p.id = any (p_piece_ids) and r.status in ('completada', 'anulada')
  ) then
    raise exception 'Tu rol no puede asignar talleres.' using errcode = '42501';
  end if;

  update public.pieces p set workshop_id = p_workshop_id
  where p.id = any (p_piece_ids) and p.workshop_id is distinct from p_workshop_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.assign_piece_workshop(uuid[], uuid) from public, anon;
grant execute on function public.assign_piece_workshop(uuid[], uuid) to authenticated;

-- El servidor (service role: scripts, tareas y tests) también registra restauraciones;
-- el código por defecto necesita poder llamar a la función.
grant execute on function private.next_restoration_code() to service_role;
