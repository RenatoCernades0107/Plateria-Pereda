-- (Era 20261022130000: chocaba con la versión de material_y_servicio_por_defecto. Se
-- puede aplicar aunque parte ya esté aplicada.)

-- La cantidad multiplica el precio (pedido del 2026-10-22): el precio de una pieza o de
-- una pieza cotizada por WhatsApp es por unidad y el total suma precio × cantidad.
-- Antes la cantidad era informativa (20261017130000_cantidad_por_pieza.sql).
--   * Total de la restauración y de la cotización de WhatsApp: Σ precio × cantidad;
--     se recalculan también al cambiar la cantidad.
--   * La orden de Shopify sigue con una línea por pieza (cantidad 1) cuyo precio es
--     precio × cantidad: la app la concilia así.
--   * Con la orden de Shopify creada, la cantidad de una pieza con precio no se cambia
--     (cambiaría el monto de su línea fuera del flujo de la orden, P12).
--   * Los totales guardados se recalculan con la nueva regla.

-- 1. Totales.
create or replace function private.restoration_total(p_restoration_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(p.price, 0) * p.quantity), 0)
  from public.pieces p
  where p.restoration_id = p_restoration_id
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

revoke execute on function private.restoration_total(uuid) from public, anon, authenticated;

drop trigger if exists pieces_recalculate_total on public.pieces;
create trigger pieces_recalculate_total
  after insert or update of price, quantity, status on public.pieces
  for each row execute function private.recalculate_restoration_total();

create or replace function private.whatsapp_quote_total(p_quote_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(i.price, 0) * i.quantity), 0)
  from public.whatsapp_quote_items i
  where i.quote_id = p_quote_id;
$$;

revoke execute on function private.whatsapp_quote_total(uuid) from public, anon, authenticated;

create or replace function private.recalculate_whatsapp_quote_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid := coalesce(new.quote_id, old.quote_id);
begin
  update public.whatsapp_quotes q
  set total = private.whatsapp_quote_total(q.id)
  where q.id = v_quote;
  return null;
end;
$$;

drop trigger if exists whatsapp_quote_items_recalculate_total on public.whatsapp_quote_items;
create trigger whatsapp_quote_items_recalculate_total
  after insert or update of price, quantity or delete on public.whatsapp_quote_items
  for each row execute function private.recalculate_whatsapp_quote_total();

comment on column public.pieces.quantity is
  'Cantidad de unidades de la pieza: el total suma precio × cantidad.';
comment on column public.pieces.price is
  'Precio de venta por unidad. Null: sin asignar; lo asignan el admin, ventas y logística.';
comment on column public.whatsapp_quote_items.quantity is
  'Cantidad de unidades: el total de la cotización suma precio × cantidad.';
comment on column public.whatsapp_quote_items.price is
  'Precio cotizado por unidad. Null: por definir.';

-- 2. Con la orden de Shopify creada, la cantidad de una pieza con precio no cambia.
create or replace function private.guard_piece_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity is distinct from old.quantity and old.price is not null
     and coalesce(current_setting('app.shopify_order_edit', true), '') <> 'on'
     and exists (
       select 1 from public.restorations
       where id = new.restoration_id and shopify_order_id is not null
     ) then
    raise exception 'Con la orden de Shopify creada, la cantidad de una pieza con precio no se cambia (P12)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_piece_quantity() from public, anon, authenticated;

drop trigger if exists pieces_guard_quantity on public.pieces;
create trigger pieces_guard_quantity
  before update of quantity on public.pieces
  for each row execute function private.guard_piece_quantity();

-- 3. Totales guardados con la nueva regla.
update public.restorations r
set total = private.restoration_total(r.id)
where r.total is distinct from private.restoration_total(r.id);

update public.whatsapp_quotes q
set total = private.whatsapp_quote_total(q.id)
where q.total is distinct from private.whatsapp_quote_total(q.id);
