-- Pago solo en el sistema (pedido del 2026-10-28): a veces ventas cobra creando el
-- pedido directamente en Shopify en vez de registrar el pago en el sistema. Para
-- corregirlo, el admin registra el pago marcándolo `skip_shopify`: cuenta en lo pagado
-- como cualquier otro, pero no se crea su pedido (ya existe el que se hizo allá).
--   * Solo el admin, solo pagos (no reembolsos) y solo en guías con un pedido por
--     pago: con la orden de piezas (guías antiguas) se concilia el total y no aplica.
--   * Queda marcado como ya en Shopify y sin nombre de pedido; no encola nada.
--   * Si luego se reembolsa, el reembolso también queda solo en el sistema (su pago
--     no tiene pedido), como ya pasaba.

alter table public.payments
  add column skip_shopify boolean not null default false;

comment on column public.payments.skip_shopify is
  'Pago registrado solo en el sistema (corrección del admin): no se crea su pedido en Shopify.';

alter table public.payments add constraint payments_skip_shopify_kind check (
  not skip_shopify or (kind = 'pago' and source = 'sistema')
);

grant insert (skip_shopify) on public.payments to authenticated;

drop policy "Admin y ventas registran pagos; reembolsos, solo el admin" on public.payments;

create policy "Admin y ventas registran pagos; reembolsos y pagos sin Shopify, solo el admin"
  on public.payments for insert to authenticated
  with check (
    source = 'sistema'
    and (
      (kind = 'pago' and not skip_shopify and (select private.has_role('{admin,ventas}')))
      or ((kind = 'reembolso' or skip_shopify) and (select private.has_role('{admin}')))
    )
  );

-- Nombre del pedido del pago y validación del reembolso; el pago sin Shopify no lleva
-- pedido y queda como ya enviado.
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

  select shopify_order_id is not null into v_has_order
  from public.restorations where id = new.restoration_id;

  if new.skip_shopify then
    if v_has_order then
      raise exception 'Esta guía tiene la orden de piezas de Shopify: el pago se concilia con ella'
        using errcode = '23514';
    end if;
    new.shopify_order_title := null;
    new.shopify_synced_at := now();
    return new;
  end if;

  -- Guías con la orden de piezas (antiguas) y lo que viene de Shopify: como antes.
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

-- Un pago sin Shopify no encola la conciliación.
create or replace function private.enqueue_payment_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'sistema' and not new.skip_shopify then
    perform private.enqueue_order_job('payment.sync', new.restoration_id);
  end if;
  return null;
end;
$$;
