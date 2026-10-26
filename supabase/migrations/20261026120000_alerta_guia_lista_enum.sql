-- Alerta "Guía lista para entregar" (pedido del 2026-10-26, D77): el valor nuevo del
-- enum va solo en esta migración; Postgres no deja usarlo en la misma transacción.
alter type public.alert_kind add value if not exists 'guia_lista';
