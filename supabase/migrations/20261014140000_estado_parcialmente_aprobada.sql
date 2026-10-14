-- Estado general "Parcialmente aprobada" (pedido del 2026-10-12, P54/D61): algunas
-- piezas vivas aprobadas y otras todavía no. Va antes de 'aprobada' porque el estado
-- guardado solo avanza según el orden del enum (P19, advance_restoration_status).
-- El valor nuevo se usa en la migración siguiente: `add value` no se puede usar en la
-- misma transacción en que se agrega.
alter type public.restoration_status add value if not exists 'parcialmente_aprobada' before 'aprobada';
