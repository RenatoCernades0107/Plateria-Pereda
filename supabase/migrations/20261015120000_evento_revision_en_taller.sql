-- Revisión en taller (pedido del 2026-10-15): eventos del historial para "Llevar al
-- taller a revisar" y "Volvió de revisión". Van en su propia migración porque
-- Postgres no deja usar un valor de enum recién agregado en la misma transacción.
alter type public.piece_event add value if not exists 'envio_revision';
alter type public.piece_event add value if not exists 'vuelta_revision';
