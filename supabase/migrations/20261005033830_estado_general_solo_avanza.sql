-- P19 (respondida el 2026-10-05): el estado general de la restauración solo avanza.
-- Si lo calculado retrocede (p. ej. una pieza devuelta se observa y vuelve al
-- taller) se conserva el estado alcanzado; si se anulan todas las piezas queda
-- Anulada, que es final. Igual a advanceRestorationStatus() de TypeScript.

create or replace function public.advance_restoration_status(
  p_current public.restoration_status,
  p_derived public.restoration_status
)
returns public.restoration_status
language sql
immutable
set search_path = ''
as $$
  select case
    when array_position(enum_range(null::public.restoration_status), p_derived)
       > array_position(enum_range(null::public.restoration_status), p_current)
    then p_derived
    else p_current
  end;
$$;

revoke execute on function public.advance_restoration_status(public.restoration_status, public.restoration_status)
  from public, anon;
grant execute on function public.advance_restoration_status(public.restoration_status, public.restoration_status)
  to authenticated, service_role;

create or replace function private.sync_restoration_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pieces jsonb;
  v_restoration public.restorations;
  v_next public.restoration_status;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at)), '[]')
  into v_pieces
  from public.pieces p where p.restoration_id = new.restoration_id;

  select * into v_restoration from public.restorations where id = new.restoration_id for update;
  v_next := public.advance_restoration_status(
    v_restoration.status, public.derive_restoration_status(v_pieces)
  );
  if v_next is distinct from v_restoration.status then
    update public.restorations r set status = v_next
    where r.id = v_restoration.id
    returning * into v_restoration;
  end if;

  -- Todas las piezas no anuladas aprobadas y sin orden: se encola su creación una
  -- sola vez (un job con error se reintenta desde "Reintentar", no se duplica).
  if v_restoration.shopify_order_id is null
     and public.is_ready_for_shopify_order(v_pieces)
     and not exists (
       select 1 from public.shopify_sync_jobs j
       where j.kind = 'order.create' and j.entity_table = 'restorations'
         and j.entity_id = v_restoration.id::text
     ) then
    perform private.enqueue_shopify_job(
      'order.create', 'restorations', v_restoration.id::text, '{}', 'order:' || v_restoration.id
    );
  end if;
  return null;
end;
$$;

revoke execute on function private.sync_restoration_status() from public, anon, authenticated;
