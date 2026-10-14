-- K10 (campos obligatorios por estado) y C5 (días en el estado actual).
--
-- piece_requirement_facts: solo dice si cada dato obligatorio está cargado (no
-- muestra montos), así cualquier rol que ve la pieza puede validar el cambio antes de
-- hacerlo. Las reglas viven en src/domain/piece-requirements.ts.
--
-- piece_status_since: desde cuándo la pieza está en su estado actual (último cambio
-- de estado del historial o, si no hay, su registro). El historial tiene RLS solo
-- para admin y ventas; logística también necesita el conteo de días.

create function public.piece_requirement_facts(p_piece_ids uuid[])
returns table (
  piece_id uuid,
  code text,
  has_price boolean,
  has_service_cost boolean,
  workshop_id uuid,
  has_after_photo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.code, p.price is not null, p.service_cost is not null, p.workshop_id,
    exists (
      select 1 from public.restoration_files f
      where f.piece_id = p.id and f.category = 'despues'
    )
  from public.pieces p
  where private.current_app_role() is not null
    and p.id = any (p_piece_ids);
$$;

revoke execute on function public.piece_requirement_facts(uuid[]) from public, anon;
grant execute on function public.piece_requirement_facts(uuid[]) to authenticated;

create function public.piece_status_since(p_piece_ids uuid[])
returns table (piece_id uuid, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(
    (select max(h.occurred_at) from public.piece_status_history h
     where h.piece_id = p.id and h.event = 'estado'),
    p.created_at
  )
  from public.pieces p
  where private.current_app_role() is not null
    and p.id = any (p_piece_ids);
$$;

revoke execute on function public.piece_status_since(uuid[]) from public, anon;
grant execute on function public.piece_status_since(uuid[]) to authenticated;
