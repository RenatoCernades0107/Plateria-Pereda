-- Pagos registrados desde el sistema y su envío a Shopify (Paso 11.2, §7.5, P43, P45).
--   * Cada pago del sistema sabe si ya llegó a Shopify (`shopify_synced_at`). Los
--     registrados antes de la orden van incluidos al crearla; con la orden creada, el
--     job `payment.sync` concilia: si el sistema ya cubrió el total registra el pago
--     completo en Shopify; si se reembolsó más de lo que Shopify cree cobrado,
--     reembolsa la diferencia; los pagos intermedios esperan al que completa el saldo.
--   * Métodos de pago con su nombre en Shopify (D34), para que el pago llegue con el
--     método correcto; sin nombre se envía el del sistema y Shopify lo deja "manual".
--   * Entrega con saldo pendiente (P45): si la restauración no es "Al crédito" y tiene
--     saldo, no se entrega; ventas y admin pueden entregar igual confirmándolo
--     (`deliver_pieces_with_balance`), y queda en el historial de la pieza.

alter table public.payments add column shopify_synced_at timestamptz;
comment on column public.payments.shopify_synced_at is
  'Cuándo llegó a Shopify (incluido en la orden o con el pago que completó el saldo). Null: pendiente de envío.';

-- Los que vienen de Shopify ya están allá.
create or replace function private.mark_shopify_payment_synced()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'shopify' then
    new.shopify_synced_at := coalesce(new.shopify_synced_at, now());
  end if;
  return new;
end;
$$;

create trigger payments_mark_shopify_synced
  before insert on public.payments
  for each row execute function private.mark_shopify_payment_synced();

-- Con la orden creada, un pago o reembolso del sistema encola la conciliación.
create or replace function private.enqueue_payment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'sistema' and exists (
    select 1 from public.restorations r
    where r.id = new.restoration_id and r.shopify_order_id is not null
  ) then
    perform private.enqueue_order_job('payment.sync', new.restoration_id);
  end if;
  return null;
end;
$$;

revoke execute on function private.enqueue_payment_sync() from public, anon, authenticated;

create trigger payments_enqueue_sync
  after insert on public.payments
  for each row execute function private.enqueue_payment_sync();

-- Nombre exacto del método de pago manual en la tienda (D34).
alter table public.payment_methods
  add column shopify_name text check (shopify_name is null or length(trim(shopify_name)) between 1 and 100);
comment on column public.payment_methods.shopify_name is
  'Nombre del método de pago manual en Shopify (Visa, Mastercard, transferencia, PagoEfectivo). Vacío: se envía el nombre del sistema.';
grant insert (shopify_name), update (shopify_name) on public.payment_methods to authenticated;

-- P45: con saldo pendiente no se entrega, salvo confirmación de ventas o admin.
create or replace function private.restoration_balance_due(p_restoration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.balance > 0 and r.payment_type <> 'credito'
    from public.restorations r where r.id = p_restoration_id
  ), false);
$$;

revoke execute on function private.restoration_balance_due(uuid) from public, anon;
grant execute on function private.restoration_balance_due(uuid) to authenticated;

create or replace function private.guard_unpaid_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'entregada' and old.status is distinct from 'entregada'
     and coalesce(current_setting('app.deliver_with_balance', true), '') <> 'on'
     and private.restoration_balance_due(new.restoration_id) then
    raise exception 'Falta cobrar el saldo' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_unpaid_delivery() from public, anon, authenticated;

create trigger pieces_guard_unpaid_delivery
  before update of status on public.pieces
  for each row execute function private.guard_unpaid_delivery();

-- Entrega confirmando que falta cobrar el saldo (solo ventas y admin). La nota del
-- historial lo deja dicho.
create or replace function public.deliver_pieces_with_balance(
  p_piece_ids uuid[],
  p_note text default null
)
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not private.has_role('{admin,ventas}') then
    raise exception 'Solo ventas o el administrador entregan con saldo pendiente.'
      using errcode = '42501';
  end if;
  perform set_config('app.deliver_with_balance', 'on', true);
  return query
    select c.piece_id, c.status from public.change_piece_status(
      p_piece_ids,
      'entregada',
      'Entregada con saldo pendiente' || coalesce(': ' || v_note, '')
    ) c;
  perform set_config('app.deliver_with_balance', '', true);
end;
$$;

revoke execute on function public.deliver_pieces_with_balance(uuid[], text) from public, anon;
grant execute on function public.deliver_pieces_with_balance(uuid[], text) to authenticated;

-- Para la interfaz: ¿falta cobrar? (sin montos, también para logística).
create or replace function public.restorations_balance_due(p_restoration_ids uuid[])
returns table (restoration_id uuid, balance_due boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, private.restoration_balance_due(r.id)
  from public.restorations r
  where r.id = any (p_restoration_ids)
    and private.can_see_restoration(r.id);
$$;

revoke execute on function public.restorations_balance_due(uuid[]) from public, anon;
grant execute on function public.restorations_balance_due(uuid[]) to authenticated;
