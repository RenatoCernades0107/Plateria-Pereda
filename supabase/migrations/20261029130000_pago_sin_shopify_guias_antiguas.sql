-- Pago solo en el sistema también en las guías antiguas (pedido del 2026-10-29): el
-- admin concilia en el sistema pagos que ya se hicieron, sin tocar la orden de piezas.
--   * El pago queda como en las guías nuevas: sin pedido, como ya enviado y sin
--     encolar nada.
--   * Desde que la guía tiene un pago así, la conciliación con su orden de piezas se
--     detiene (`payment.sync` no registra el pago completo ni reembolsa): la orden
--     queda como está y los pagos y reembolsos que sigan quedan solo en el sistema.

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

  if new.skip_shopify then
    new.shopify_order_title := null;
    new.shopify_synced_at := now();
    return new;
  end if;

  select shopify_order_id is not null into v_has_order
  from public.restorations where id = new.restoration_id;

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

comment on column public.payments.skip_shopify is
  'Pago registrado solo en el sistema (corrección del admin): no se crea su pedido en Shopify. En una guía antigua, además detiene la conciliación con su orden de piezas.';
