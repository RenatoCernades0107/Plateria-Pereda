-- Evento del historial de la pieza para el cambio de precio con la orden de Shopify
-- creada (Paso 9.2, P12). Va en su propia migración porque Postgres no deja usar un
-- valor de enum recién agregado en la misma transacción.
alter type public.piece_event add value if not exists 'cambio_precio';
