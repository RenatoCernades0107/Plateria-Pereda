-- Orden de Shopify al aprobar (Paso 9.1). El handler `order.create` del outbox crea
-- la orden; si al procesarlo la restauración ya no está lista (p. ej., se agregó una
-- pieza), termina con result = {"skipped": true} y la orden se vuelve a encolar cuando
-- todas las piezas que se cobran estén aprobadas.

CREATE OR REPLACE FUNCTION private.sync_restoration_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_pieces jsonb;
  v_restoration public.restorations;
  v_next public.restoration_status;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at,
      'readyForDelivery', p.ready_for_delivery)), '[]')
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

  -- Todas las piezas que se cobran aprobadas y sin orden: se encola su creación una
  -- sola vez (un job con error se reintenta desde "Reintentar", no se duplica). Un
  -- job que se omitió porque la restauración dejó de estar lista (se agregó una pieza
  -- antes de procesarlo) no cuenta: se vuelve a encolar.
  if v_restoration.shopify_order_id is null
     and public.is_ready_for_shopify_order(v_pieces)
     and not exists (
       select 1 from public.shopify_sync_jobs j
       where j.kind = 'order.create' and j.entity_table = 'restorations'
         and j.entity_id = v_restoration.id::text
         and not (j.status = 'ok' and coalesce(j.result ->> 'skipped', '') = 'true')
     ) then
    perform private.enqueue_shopify_job(
      'order.create', 'restorations', v_restoration.id::text, '{}', 'order:' || v_restoration.id
    );
  end if;
  return null;
end;
$$;
