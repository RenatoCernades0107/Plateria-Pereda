-- Alertas de cotizaciones (pedido del 2026-11-19): los valores nuevos del enum van
-- solos en esta migración; Postgres no deja usarlos en la misma transacción.
alter type public.alert_kind add value if not exists 'cotizacion_aceptada';
alter type public.alert_kind add value if not exists 'cotizacion_facturada';
