-- Sin el estado "En restauración" (pedido del 2026-10-17): llevar una pieza al taller
-- deja de ser un cambio de estado y pasa a ser una acción, como la revisión en taller.
-- Evento del historial para "Enviar al taller". Va en su propia migración porque
-- Postgres no deja usar un valor de enum recién agregado en la misma transacción.
alter type public.piece_event add value if not exists 'envio_taller';
