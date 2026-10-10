-- Orden de Shopify de la restauración (Fase 9).
--   * 9.1: el job `order.create` ya lo encola `private.sync_restoration_status()` al
--     aprobarse todas las piezas que se cobran; lo procesa el handler de la aplicación.
--   * 9.2 (P12): con la orden creada, anular / rechazar / dejar sin arreglo una pieza,
--     aprobar una pieza agregada o cambiar un precio encola `order.edit`, que concilia
--     la orden con las piezas. El precio lo cambia solo el admin, con motivo, con
--     `change_piece_price`.
--   * 9.3 (P44): entregar una pieza encola `order.fulfill`, que marca su línea como
--     preparada.
-- Un job pendiente por restauración y tipo basta: el handler lee el estado al
-- procesarse. Si el job está en curso se encola otro, para no perder el cambio.

create or replace function private.enqueue_order_job(p_kind text, p_restoration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shopify_sync_jobs j
    where j.kind = p_kind and j.entity_table = 'restorations'
      and j.entity_id = p_restoration_id::text and j.status = 'pending'
  ) then
    perform private.enqueue_shopify_job(p_kind, 'restorations', p_restoration_id::text);
  end if;
end;
$$;

revoke execute on function private.enqueue_order_job(text, uuid) from public, anon, authenticated;

create or replace function private.enqueue_order_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed constant public.piece_status[] := '{anulada,rechazada,sin_arreglo}';
  v_was_charged boolean;
  v_is_charged boolean;
begin
  if not exists (
    select 1 from public.restorations r
    where r.id = new.restoration_id and r.shopify_order_id is not null
  ) then
    return null;
  end if;

  v_is_charged := new.approved_at is not null and not (new.status = any (v_closed));
  v_was_charged := tg_op = 'UPDATE'
    and old.approved_at is not null and not (old.status = any (v_closed));
  if v_is_charged is distinct from v_was_charged
     or (v_is_charged and tg_op = 'UPDATE' and new.price is distinct from old.price) then
    perform private.enqueue_order_job('order.edit', new.restoration_id);
  end if;

  if new.status = 'entregada' and (tg_op = 'INSERT' or old.status is distinct from 'entregada') then
    perform private.enqueue_order_job('order.fulfill', new.restoration_id);
  end if;
  return null;
end;
$$;

revoke execute on function private.enqueue_order_changes() from public, anon, authenticated;

create trigger pieces_enqueue_order_changes
  after insert or update of status, price, approved_at on public.pieces
  for each row execute function private.enqueue_order_changes();

-- Cambio de precio con la orden creada (P12): solo admin, con motivo. Queda en el
-- historial de la pieza (el motivo) y en la auditoría (el precio anterior y el nuevo).
create or replace function public.change_piece_price(
  p_piece_id uuid,
  p_price numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece public.pieces;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not (select private.has_role('{admin}')) then
    raise exception 'Solo el administrador cambia el precio con la orden creada.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Escribe el motivo del cambio de precio.' using errcode = '23514';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'El motivo tiene más de 1000 caracteres' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 or round(p_price, 2) <> p_price then
    raise exception 'Ingresa un precio válido (hasta 2 decimales).' using errcode = '22023';
  end if;

  select * into v_piece from public.pieces p where p.id = p_piece_id for update;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;
  if v_piece.price = p_price then
    return;
  end if;

  -- El guard de la pieza deja cambiar el precio con la orden creada solo por esta vía.
  perform set_config('app.shopify_order_edit', 'on', true);
  update public.pieces p set price = p_price where p.id = p_piece_id
  returning * into v_piece;
  perform set_config('app.shopify_order_edit', '', true);

  perform private.add_status_history(v_piece, v_piece.status, v_piece.status, v_reason, 'cambio_precio');
end;
$$;

revoke execute on function public.change_piece_price(uuid, numeric, text) from public, anon;
grant execute on function public.change_piece_price(uuid, numeric, text) to authenticated;
