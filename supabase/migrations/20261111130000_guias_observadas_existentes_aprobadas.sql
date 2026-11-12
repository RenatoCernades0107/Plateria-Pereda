-- Guías observadas que ya existían (pedido del 2026-11-11): hasta ahora sus piezas nacían
-- Observadas sin fecha de aprobación y la guía se quedaba en "Registrada". Desde
-- 20261111120000 nacen Aprobadas; aquí se ponen al día las anteriores.
--   * A cada pieza viva (sin anuladas, rechazadas ni sin arreglo) de una guía observada que
--     no tiene fecha de aprobación se le pone una: la de cuando se observó (o se entregó),
--     o, a falta de ambas, la de su registro. Así no se inventan fechas nuevas.
--   * El estado general de esas guías se vuelve a calcular. Solo avanza (P19): una guía que ya
--     estaba más adelante, p. ej. Lista o Completada, se queda como está.
-- No toca guías Normales ni Internas, ni precios, pagos u órdenes de Shopify (las guías
-- observadas no las tienen). Se puede repetir sin efecto: solo actúa sobre lo que falta.

update public.pieces p
set approved_at = coalesce(p.observed_at, p.delivered_at, p.created_at)
from public.restorations r
where r.id = p.restoration_id
  and r.kind = 'observado'
  and p.approved_at is null
  and p.status not in ('anulada', 'rechazada', 'sin_arreglo');

update public.restorations r
set status = public.advance_restoration_status(
  r.status, public.derive_restoration_status(private.restoration_pieces_json(r.id))
)
where r.kind = 'observado'
  and r.status is distinct from public.advance_restoration_status(
    r.status, public.derive_restoration_status(private.restoration_pieces_json(r.id))
  );
