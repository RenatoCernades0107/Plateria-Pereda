-- Un pedido de Shopify por pago (pedido del 2026-10-19). En el plan Grow la API no
-- acepta pagos parciales en una orden ya creada, así que la orden con una línea por
-- pieza quedaba "parcialmente pagada" hasta el último pago. Ahora:
--   * Cada pago del sistema (cada método, si se reparte) es su propio pedido en
--     Shopify, ya pagado: una línea personalizada por el monto. El nombre del pedido y
--     el de su línea son el mismo: "Adelanto Guía RES-00043 A1", "… A2"… según van
--     llegando; el pago que completa el total es "Saldo Guía RES-00043" (si luego sube
--     el precio y otro pago vuelve a completarlo, "Saldo Guía RES-00043 2").
--   * Ya no se crea la orden con las piezas. Las guías que ya la tienen
--     (`shopify_order_id`) siguen como antes: se concilian contra esa orden.
--   * Un reembolso dice qué pago devuelve (`refunded_payment_id`) y no pasa de lo que
--     queda de ese pago; se reembolsa en su pedido.
--   * Los pagos hechos directamente en Shopify ya no entran al registro; los
--     reembolsos hechos en Shopify sobre un pedido de pago sí (los importa el job).
--   * Al entregarse todas las piezas que se cobran, los pedidos de pago quedan
--     preparados (`order.fulfill`).
-- Los jobs siguen siendo por restauración (`payment.sync`, `order.fulfill`): el outbox
-- no procesa a la vez dos de la misma entidad, así dos pagos seguidos no duplican
-- pedidos.

-- 1. Pedido de cada pago y pago que devuelve cada reembolso.
alter table public.payments
  add column shopify_order_title text,
  add column shopify_order_id text unique,
  add column shopify_order_name text,
  add column refunded_payment_id uuid references public.payments (id);

comment on column public.payments.shopify_order_title is
  'Nombre del pedido de Shopify de este pago (y de su línea): "Adelanto Guía RES-00043 A1" o "Saldo Guía RES-00043". Se fija al registrarlo.';
comment on column public.payments.shopify_order_id is 'Pedido de Shopify de este pago.';
comment on column public.payments.shopify_order_name is 'Nombre del pedido como lo muestra Shopify.';
comment on column public.payments.refunded_payment_id is 'Reembolso: el pago que devuelve.';

create unique index payments_shopify_order_title_idx
  on public.payments (restoration_id, shopify_order_title);
create index payments_refunded_payment_idx on public.payments (refunded_payment_id);

alter table public.payments add constraint payments_refund_target check (
  refunded_payment_id is null or kind = 'reembolso'
);

grant insert (refunded_payment_id) on public.payments to authenticated;

-- Nombre del pedido de un pago: "Saldo" si completa el total, si no el siguiente
-- adelanto. Lo pagado antes se lee de `payments` si no se pasa (incluye las filas
-- anteriores de la misma sentencia: un pago repartido en varios métodos numera cada
-- uno).
create or replace function private.payment_order_title(
  p_restoration_id uuid,
  p_amount numeric,
  p_paid_before numeric default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_total numeric;
  v_paid numeric := p_paid_before;
  v_count integer;
begin
  select code, total into v_code, v_total
  from public.restorations where id = p_restoration_id;

  if v_paid is null then
    select coalesce(sum(case kind when 'pago' then amount else -amount end), 0)
    into v_paid
    from public.payments where restoration_id = p_restoration_id;
  end if;

  if v_total > 0 and v_paid + p_amount >= v_total then
    select count(*) into v_count from public.payments
    where restoration_id = p_restoration_id and shopify_order_title like 'Saldo Guía %';
    return 'Saldo Guía ' || v_code || case when v_count > 0 then ' ' || (v_count + 1) else '' end;
  end if;

  select count(*) into v_count from public.payments
  where restoration_id = p_restoration_id and shopify_order_title like 'Adelanto Guía %';
  return format('Adelanto Guía %s A%s', v_code, v_count + 1);
end;
$$;

revoke execute on function private.payment_order_title(uuid, numeric, numeric)
  from public, anon, authenticated;

-- Nombre del pedido del pago y validación del reembolso. Corre después de
-- payments_prepare (orden alfabético), que ya bloqueó la restauración.
create or replace function private.prepare_payment_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_order boolean;
  v_target public.payments;
  v_left numeric;
begin
  if new.refunded_payment_id is not null then
    select * into v_target from public.payments where id = new.refunded_payment_id;
    if v_target.id is null or v_target.restoration_id <> new.restoration_id
       or v_target.kind <> 'pago' then
      raise exception 'El pago que se reembolsa no es de esta guía' using errcode = '23514';
    end if;
  end if;

  -- Guías con la orden de piezas (antiguas) y lo que viene de Shopify: como antes.
  select shopify_order_id is not null into v_has_order
  from public.restorations where id = new.restoration_id;
  if v_has_order or new.source <> 'sistema' then
    return new;
  end if;

  if new.kind = 'pago' then
    new.shopify_order_title := private.payment_order_title(new.restoration_id, new.amount);
    return new;
  end if;

  if new.refunded_payment_id is null then
    raise exception 'Elige el pago que se reembolsa' using errcode = '23514';
  end if;
  select v_target.amount - coalesce(sum(r.amount), 0) into v_left
  from public.payments r
  where r.refunded_payment_id = v_target.id;
  if new.amount > v_left then
    raise exception 'El reembolso supera lo que queda de ese pago' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.prepare_payment_order() from public, anon, authenticated;

create trigger payments_shopify_order
  before insert on public.payments
  for each row execute function private.prepare_payment_order();

-- 2. Un pago o reembolso del sistema encola la conciliación siempre: con la orden de
--    piezas se concilia contra ella; sin ella se crea el pedido del pago (o se
--    reembolsa en el suyo). El job espera si el cliente aún no está en Shopify.
create or replace function private.enqueue_payment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'sistema' then
    perform private.enqueue_order_job('payment.sync', new.restoration_id);
  end if;
  return null;
end;
$$;

-- 3. Cambios de piezas: la orden de piezas como antes; sin ella, al quedar entregadas
--    todas las que se cobran se preparan los pedidos de pago (si hay alguno).
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
    if new.status = 'entregada'
       and (tg_op = 'INSERT' or old.status is distinct from 'entregada')
       and not exists (
         select 1 from public.pieces p
         where p.restoration_id = new.restoration_id
           and not (p.status = any (v_closed)) and p.status <> 'entregada'
       )
       and exists (
         select 1 from public.payments pay
         where pay.restoration_id = new.restoration_id and pay.shopify_order_title is not null
       ) then
      perform private.enqueue_order_job('order.fulfill', new.restoration_id);
    end if;
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

-- 4. El estado general sigue a las piezas; ya no se encola la orden con las piezas.
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
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at,
      'readyForDelivery', p.ready_for_delivery, 'price', p.price)), '[]')
  into v_pieces
  from public.pieces p where p.restoration_id = new.restoration_id;

  select * into v_restoration from public.restorations where id = new.restoration_id for update;
  v_next := public.advance_restoration_status(
    v_restoration.status, public.derive_restoration_status(v_pieces)
  );
  if v_next is distinct from v_restoration.status then
    update public.restorations r set status = v_next where r.id = v_restoration.id;
  end if;
  return null;
end;
$$;

-- 5. Datos existentes sin orden de piezas: los pagos que aún no llegaron a Shopify
--    (iban a entrar al crear la orden) reciben su nombre y se encola su pedido. Los
--    reembolsos que aún no llegaron no dicen qué pago devuelven: quedan solo en el
--    sistema. Las órdenes de piezas aún pendientes de crear ya no se crean.
do $$
declare
  v_payment record;
begin
  for v_payment in
    select p.id, p.restoration_id, p.amount,
      coalesce((
        select sum(case b.kind when 'pago' then b.amount else -b.amount end)
        from public.payments b
        where b.restoration_id = p.restoration_id
          and (b.created_at, b.id) < (p.created_at, p.id)
      ), 0) as paid_before
    from public.payments p
    join public.restorations r on r.id = p.restoration_id
    where r.shopify_order_id is null and p.source = 'sistema' and p.kind = 'pago'
      and p.shopify_synced_at is null
    order by p.created_at, p.id
  loop
    update public.payments
    set shopify_order_title = private.payment_order_title(
      v_payment.restoration_id, v_payment.amount, v_payment.paid_before
    )
    where id = v_payment.id;
  end loop;
end;
$$;

update public.payments p set shopify_synced_at = now()
from public.restorations r
where r.id = p.restoration_id and r.shopify_order_id is null
  and p.source = 'sistema' and p.kind = 'reembolso' and p.shopify_synced_at is null;

update public.shopify_sync_jobs set status = 'ok', result = '{"skipped": true}'
where kind = 'order.create' and status in ('pending', 'error');

select private.enqueue_order_job('payment.sync', r.id)
from public.restorations r
where r.shopify_order_id is null
  and exists (
    select 1 from public.payments p
    where p.restoration_id = r.id and p.shopify_order_title is not null
      and p.shopify_order_id is null
  );
