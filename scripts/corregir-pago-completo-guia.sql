-- Corrección puntual: deja una guía como PAGO COMPLETO en la base de datos sin que
-- el pago pase por Shopify.
--
-- Registra en `payments` un pago por el saldo pendiente. Los triggers de siempre
-- recalculan `paid` y pasan `payment_status` a "pagado". El pago entra con
-- source = 'shopify' y un id de transacción propio ('correccion-manual-<código>'):
-- así la BD lo trata como un pago que ya está en Shopify, no encola `payment.sync`
-- y el job de pedidos no crea ningún pedido para él. Son sentencias sueltas, sin
-- bloques `do $$`, para que corra en cualquier editor SQL.
--
-- Uso: cambia el código de la guía y el método (en las dos sentencias), corre el
-- PASO 1 para revisar y luego el PASO 2. El paso 2 no hace nada si la guía ya está
-- pagada, no existe, no tiene total o es interna/observada; correrlo dos veces no
-- duplica el pago.

-- PASO 1: revisar (no cambia nada).
select r.code, r.kind, r.total, r.paid, r.balance, r.payment_status,
  (select string_agg(name, ', ' order by name) from public.payment_methods) as metodos
from public.restorations r
where r.code = 'RES-00034';

-- PASO 2: registrar el pago del saldo.
insert into public.payments
  (restoration_id, amount, payment_method_id, method_name, reason, source, shopify_transaction_id)
select r.id, r.balance, m.id, m.name,
  'Corrección manual: pago completo registrado sin pasar por Shopify',
  'shopify', 'correccion-manual-' || r.code
from public.restorations r
join public.payment_methods m on m.name = 'Efectivo'
where r.code = 'RES-00034' and r.kind = 'normal' and r.total > 0 and r.balance > 0
returning restoration_id, amount, method_name;
