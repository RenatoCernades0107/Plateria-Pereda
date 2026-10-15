-- Retroceder el estado de una pieza (pedido del 2026-10-15): evento del historial para
-- "Retroceder estado". Va en su propia migración porque Postgres no deja usar un valor
-- de enum recién agregado en la misma transacción.
alter type public.piece_event add value if not exists 'retroceso';
