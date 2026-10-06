-- Valores nuevos de los enums (P48). Van en su propia migración porque Postgres no
-- deja usar un valor recién agregado en la misma transacción.
--   * piece_location 'por_whatsapp': pieza de una restauración que salió de una
--     cotización de WhatsApp y que aún no llegó a la tienda.
--   * restoration_status 'rechazada': todas las piezas cerradas y alguna rechazada o
--     sin arreglo (si todas se anularon, queda 'anulada').
alter type public.piece_location add value if not exists 'por_whatsapp' before 'sin_enviar';
alter type public.restoration_status add value if not exists 'rechazada' after 'anulada';
