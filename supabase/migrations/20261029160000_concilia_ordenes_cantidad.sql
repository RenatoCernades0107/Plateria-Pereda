-- Concilia las órdenes de piezas (guías antiguas) con la regla de cantidad × precio.
-- 20261022140000_cantidad_multiplica_precio.sql y 20261022150000_importe_con_techo.sql
-- recalcularon `restorations.total` directamente: no cambiaron ninguna pieza, así que el
-- trigger `pieces_enqueue_order_changes` no encoló `order.edit` y la orden de Shopify se
-- quedó con el importe anterior de las piezas con más de una unidad (RES-00022: la
-- línea de 3 × S/ 26.66 siguió en S/ 26.66 en vez de S/ 80.00).
--
-- Se encola `order.edit` en las guías con orden de piezas y alguna pieza cobrada con
-- más de una unidad. El handler lee el estado al procesarse: ajusta la línea al importe
-- actual (o no cambia nada si ya coincide) y concilia los pagos con el nuevo total.

select private.enqueue_order_job('order.edit', r.id)
from public.restorations r
where r.shopify_order_id is not null
  and exists (
    select 1 from public.pieces p
    where p.restoration_id = r.id
      and p.quantity > 1
      and p.price is not null
      and p.approved_at is not null
      and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
  );
