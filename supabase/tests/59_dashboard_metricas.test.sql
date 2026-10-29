begin;

select plan(72);

-- Métricas del dashboard (Fase 13, P33). Datos de marzo de 2025 (el seed es reciente, así
-- que no se mezcla). Las cifras "de hoy" (saldo por cobrar) se comparan contra lo que
-- había antes de insertar.
select set_config('app.deliver_with_balance', 'on', true);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000055a1', 'admin@dash.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000055a2', 'ventas1@dash.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000055a3', 'ventas2@dash.test', '{"role":"ventas"}', '{"full_name":"Víctor Ventas"}'),
  ('00000000-0000-0000-0000-0000000055a4', 'logistica@dash.test', '{"role":"logistica"}', '{"full_name":"Lola Logística"}');

create temporary table base (due numeric);
grant all on base to authenticated;
create temporary table res (name text, j jsonb);
grant all on res to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a1","role":"authenticated"}', true);
insert into base select (public.dashboard_summary('2025-03-01', '2025-03-31')->>'balance_due')::numeric;
reset role;

-- ---------------------------------------------------------------------------------------
-- Datos
-- ---------------------------------------------------------------------------------------
insert into public.workshops (id, name) values
  ('00000000-0000-0000-0000-0000000055e1', 'Taller Uno'),
  ('00000000-0000-0000-0000-0000000055e2', 'Taller Dos');
insert into public.services (id, name) values
  ('00000000-0000-0000-0000-0000000055f1', 'Baño dash'),
  ('00000000-0000-0000-0000-0000000055f2', 'Pulido dash');
insert into public.materials (id, name) values ('00000000-0000-0000-0000-0000000055f3', 'Plata dash');

insert into public.clients (id, kind, first_name, last_name, region, created_at) values
  ('00000000-0000-0000-0000-0000000055c1', 'persona', 'Cora', 'Uno', 'LIM', '2025-02-01T15:00:00Z'),
  ('00000000-0000-0000-0000-0000000055c3', 'persona', 'Carlos', 'Tres', 'LIM', '2025-03-20T15:00:00Z');
insert into public.clients (id, kind, legal_name, document_type, document_number, region, created_at) values
  ('00000000-0000-0000-0000-0000000055c2', 'empresa', 'Empresa Dos SAC', 'ruc', '20100070970', 'ARE', '2025-03-05T15:00:00Z');

-- Guías Normales (R0 es anterior al rango y da la recompra de C1), una interna y una de WhatsApp.
insert into public.restorations (id, client_id, payment_type, created_by, created_at, kind) values
  ('00000000-0000-0000-0000-000000005500', '00000000-0000-0000-0000-0000000055c1', 'contado', '00000000-0000-0000-0000-0000000055a2', '2025-02-20T15:00:00Z', 'normal'),
  ('00000000-0000-0000-0000-000000005501', '00000000-0000-0000-0000-0000000055c1', 'contado', '00000000-0000-0000-0000-0000000055a2', '2025-03-02T15:00:00Z', 'normal'),
  ('00000000-0000-0000-0000-000000005502', '00000000-0000-0000-0000-0000000055c2', 'contado', '00000000-0000-0000-0000-0000000055a3', '2025-03-10T15:00:00Z', 'normal'),
  ('00000000-0000-0000-0000-000000005503', '00000000-0000-0000-0000-0000000055c3', 'contado', '00000000-0000-0000-0000-0000000055a2', '2025-03-20T15:00:00Z', 'normal');
insert into public.restorations (id, client_id, payment_type, created_by, created_at, kind) values
  ('00000000-0000-0000-0000-000000005509', '00000000-0000-0000-0000-0000000055c1', 'sin_definir', '00000000-0000-0000-0000-0000000055a2', '2025-03-12T15:00:00Z', 'interno');

-- Cotizaciones de WhatsApp (P46): Q2 se copió en parte a la guía R4.
insert into public.whatsapp_quotes (id, customer_name, payment_type, created_by, created_at) values
  ('00000000-0000-0000-0000-000000005581', 'Cotizada', 'contado', '00000000-0000-0000-0000-0000000055a2', '2025-03-06T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005582', 'Pedida en parte', 'contado', '00000000-0000-0000-0000-0000000055a3', '2025-03-07T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005583', 'Descartada', 'contado', '00000000-0000-0000-0000-0000000055a3', '2025-03-08T15:00:00Z');
insert into public.whatsapp_quote_items (id, quote_id, number, description, price, quantity) values
  ('00000000-0000-0000-0000-000000005591', '00000000-0000-0000-0000-000000005581', 1, 'Cuchara', 10, 1),
  ('00000000-0000-0000-0000-000000005592', '00000000-0000-0000-0000-000000005582', 1, 'Tenedor', 40, 1),
  ('00000000-0000-0000-0000-000000005593', '00000000-0000-0000-0000-000000005582', 2, 'Cuchillo', 25.5, 2),
  ('00000000-0000-0000-0000-000000005594', '00000000-0000-0000-0000-000000005583', 1, 'Plato', 10, 1);
insert into public.restorations (id, client_id, payment_type, created_by, created_at, kind, origin, whatsapp_quote_id) values
  ('00000000-0000-0000-0000-000000005504', '00000000-0000-0000-0000-0000000055c2', 'contado', '00000000-0000-0000-0000-0000000055a3', '2025-03-15T15:00:00Z', 'normal', 'whatsapp', '00000000-0000-0000-0000-000000005582');

-- Piezas
insert into public.pieces (id, restoration_id, description, price, quantity, workshop_id, service_ids, material_ids, service_cost) values
  ('00000000-0000-0000-0000-000000005570', '00000000-0000-0000-0000-000000005500', 'Anterior', 90, 1, null, '{}', '{}', null),
  ('00000000-0000-0000-0000-000000005571', '00000000-0000-0000-0000-000000005501', 'P1 entregada', 100, 1, '00000000-0000-0000-0000-0000000055e1', array['00000000-0000-0000-0000-0000000055f1']::uuid[], array['00000000-0000-0000-0000-0000000055f3']::uuid[], 40),
  ('00000000-0000-0000-0000-000000005572', '00000000-0000-0000-0000-000000005501', 'P2 techo', 26.66, 3, '00000000-0000-0000-0000-0000000055e1', array['00000000-0000-0000-0000-0000000055f1', '00000000-0000-0000-0000-0000000055f2']::uuid[], '{}', null),
  ('00000000-0000-0000-0000-000000005573', '00000000-0000-0000-0000-000000005501', 'P3 anulada', 50, 1, null, '{}', '{}', null),
  ('00000000-0000-0000-0000-000000005574', '00000000-0000-0000-0000-000000005502', 'P4 borde', 200, 1, '00000000-0000-0000-0000-0000000055e2', '{}', '{}', 25),
  ('00000000-0000-0000-0000-000000005575', '00000000-0000-0000-0000-000000005502', 'P5 fuera', 70, 1, '00000000-0000-0000-0000-0000000055e2', '{}', '{}', null),
  ('00000000-0000-0000-0000-000000005576', '00000000-0000-0000-0000-000000005503', 'P6 consulta', 60, 1, null, '{}', '{}', null),
  ('00000000-0000-0000-0000-000000005578', '00000000-0000-0000-0000-000000005504', 'P8 whatsapp', 40, 1, null, '{}', '{}', null),
  ('00000000-0000-0000-0000-000000005579', '00000000-0000-0000-0000-000000005509', 'Interna', null, 1, null, '{}', '{}', 15);
update public.pieces set whatsapp_quote_item_id = '00000000-0000-0000-0000-000000005592'
  where id = '00000000-0000-0000-0000-000000005578';

-- Estados, fechas e historial conocidos.
update public.pieces set created_at = '2025-03-02T15:00:00Z' where id in (
  '00000000-0000-0000-0000-000000005571', '00000000-0000-0000-0000-000000005572', '00000000-0000-0000-0000-000000005573');
update public.pieces set created_at = '2025-03-10T15:00:00Z' where id in (
  '00000000-0000-0000-0000-000000005574', '00000000-0000-0000-0000-000000005575');
update public.pieces set created_at = '2025-03-20T15:00:00Z' where id = '00000000-0000-0000-0000-000000005576';
update public.pieces set created_at = '2025-03-15T15:00:00Z' where id = '00000000-0000-0000-0000-000000005578';
update public.pieces set created_at = '2025-02-20T15:00:00Z', status = 'aprobada', approved_at = '2025-02-25T15:00:00Z'
  where id = '00000000-0000-0000-0000-000000005570';
update public.pieces set status = 'aprobada', approved_at = '2025-03-03T17:00:00Z', urgent = false
  where id = '00000000-0000-0000-0000-000000005571';
update public.pieces set status = 'aprobada', approved_at = '2025-03-03T17:00:00Z', urgent = true,
  estimated_delivery_date = current_date + 7
  where id = '00000000-0000-0000-0000-000000005572';
update public.pieces set status = 'anulada', approved_at = '2025-03-04T17:00:00Z', cancelled_at = '2025-03-05T17:00:00Z'
  where id = '00000000-0000-0000-0000-000000005573';
-- Borde de Lima: 22:00 del 31/03 entra; 01:00 del 01/04 ya no.
update public.pieces set status = 'aprobada', approved_at = '2025-04-01T03:00:00Z'
  where id = '00000000-0000-0000-0000-000000005574';
update public.pieces set status = 'aprobada', approved_at = '2025-04-01T06:00:00Z'
  where id = '00000000-0000-0000-0000-000000005575';
update public.pieces set status = 'aprobada', approved_at = '2025-03-20T17:00:00Z'
  where id = '00000000-0000-0000-0000-000000005578';
update public.pieces set status = 'en_consulta' where id = '00000000-0000-0000-0000-000000005576';

-- Taller: P1 y P2 en el Taller Uno (3 y 6 días), P4 en el Taller Dos (12 días, observada).
delete from public.piece_status_history where piece_id in (
  '00000000-0000-0000-0000-000000005571', '00000000-0000-0000-0000-000000005572',
  '00000000-0000-0000-0000-000000005574', '00000000-0000-0000-0000-000000005575');
insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, workshop_id, occurred_at) values
  ('00000000-0000-0000-0000-000000005571', '00000000-0000-0000-0000-000000005501', 'envio_taller', 'aprobada', 'aprobada', '00000000-0000-0000-0000-0000000055e1', '2025-03-04T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005571', '00000000-0000-0000-0000-000000005501', 'vuelta_taller', 'aprobada', 'aprobada', null, '2025-03-07T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005572', '00000000-0000-0000-0000-000000005501', 'envio_taller', 'aprobada', 'aprobada', '00000000-0000-0000-0000-0000000055e1', '2025-03-04T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005572', '00000000-0000-0000-0000-000000005501', 'vuelta_taller', 'aprobada', 'aprobada', null, '2025-03-10T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005574', '00000000-0000-0000-0000-000000005502', 'envio_taller', 'aprobada', 'aprobada', '00000000-0000-0000-0000-0000000055e2', '2025-03-12T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005574', '00000000-0000-0000-0000-000000005502', 'vuelta_taller', 'aprobada', 'aprobada', null, '2025-03-24T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005574', '00000000-0000-0000-0000-000000005502', 'estado', 'aprobada', 'observada', null, '2025-03-25T15:00:00Z');
update public.pieces set first_sent_at = '2025-03-04T15:00:00Z', last_sent_at = '2025-03-04T15:00:00Z', last_returned_at = '2025-03-07T15:00:00Z'
  where id = '00000000-0000-0000-0000-000000005571';
update public.pieces set first_sent_at = '2025-03-04T15:00:00Z', last_sent_at = '2025-03-04T15:00:00Z', last_returned_at = '2025-03-10T15:00:00Z'
  where id = '00000000-0000-0000-0000-000000005572';
update public.pieces set first_sent_at = '2025-03-12T15:00:00Z', last_sent_at = '2025-03-12T15:00:00Z', last_returned_at = '2025-03-24T15:00:00Z'
  where id = '00000000-0000-0000-0000-000000005574';
-- P5 sigue en el taller desde hace 10 días.
update public.pieces set first_sent_at = now() - interval '10 days', last_sent_at = now() - interval '10 days', last_returned_at = null
  where id = '00000000-0000-0000-0000-000000005575';
insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, workshop_id, occurred_at) values
  ('00000000-0000-0000-0000-000000005575', '00000000-0000-0000-0000-000000005502', 'envio_taller', 'aprobada', 'aprobada', '00000000-0000-0000-0000-0000000055e2', now() - interval '10 days');
-- P1 entregada el 8/03 (6 días desde su registro).
update public.pieces set status = 'entregada', delivered_at = '2025-03-08T15:00:00Z'
  where id = '00000000-0000-0000-0000-000000005571';

-- Pagos: R1 cobró 100 + 50 y devolvió 20; R2 pagó 100 ya fuera del rango (1/04).
insert into public.payments (id, restoration_id, kind, amount, method_name, paid_on, created_by_name) values
  ('00000000-0000-0000-0000-000000005561', '00000000-0000-0000-0000-000000005501', 'pago', 100, 'Efectivo', '2025-03-03', 'x'),
  ('00000000-0000-0000-0000-000000005562', '00000000-0000-0000-0000-000000005501', 'pago', 50, 'Yape', '2025-03-04', 'x'),
  ('00000000-0000-0000-0000-000000005564', '00000000-0000-0000-0000-000000005502', 'pago', 100, 'Efectivo', '2025-04-01', 'x');
insert into public.payments (restoration_id, kind, amount, method_name, paid_on, reason, refunded_payment_id, created_by_name) values
  ('00000000-0000-0000-0000-000000005501', 'reembolso', 20, 'Efectivo', '2025-03-05', 'Devolución', '00000000-0000-0000-0000-000000005561', 'x');

-- Estados generales de las guías (para el saldo por cobrar y los conteos).
update public.restorations set status = 'aprobada' where id in (
  '00000000-0000-0000-0000-000000005500', '00000000-0000-0000-0000-000000005501',
  '00000000-0000-0000-0000-000000005502', '00000000-0000-0000-0000-000000005504');
update public.restorations set status = 'registrada' where id = '00000000-0000-0000-0000-000000005503';

-- Cotizaciones de WhatsApp: estados y motivo.
update public.whatsapp_quotes set status = 'cotizada' where id = '00000000-0000-0000-0000-000000005581';
update public.whatsapp_quotes set status = 'pedida_parcial' where id = '00000000-0000-0000-0000-000000005582';
update public.whatsapp_quotes set status = 'descartada', discarded_at = '2025-03-09T15:00:00Z', discard_reason = ' Muy caro '
  where id = '00000000-0000-0000-0000-000000005583';

-- Cotizador COT.
insert into public.quotes (id, status, client_id, client_name, validity_days, issue_date, created_by, created_at) values
  ('00000000-0000-0000-0000-000000005541', 'emitida', '00000000-0000-0000-0000-0000000055c1', 'Q uno', 365, '2025-03-05', '00000000-0000-0000-0000-0000000055a2', '2025-03-05T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005542', 'aceptada', '00000000-0000-0000-0000-0000000055c1', 'Q dos', 365, '2025-03-06', '00000000-0000-0000-0000-0000000055a2', '2025-03-06T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005543', 'emitida', '00000000-0000-0000-0000-0000000055c1', 'Q tres', 15, '2025-03-07', '00000000-0000-0000-0000-0000000055a2', '2025-03-07T15:00:00Z'),
  ('00000000-0000-0000-0000-000000005544', 'borrador', '00000000-0000-0000-0000-0000000055c1', 'Q cuatro', 15, null, '00000000-0000-0000-0000-0000000055a2', '2025-03-08T15:00:00Z');

-- ---------------------------------------------------------------------------------------
-- Como admin
-- ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a1","role":"authenticated"}', true);
insert into res values
  ('summary', public.dashboard_summary('2025-03-01', '2025-03-31', 'dia')),
  ('summary_semana', public.dashboard_summary('2025-03-01', '2025-03-31', 'semana')),
  ('summary_mes', public.dashboard_summary('2025-03-01', '2025-03-31', 'mes')),
  ('sales', public.dashboard_sales('2025-03-01', '2025-03-31', 'dia')),
  ('orders', public.dashboard_orders('2025-03-01', '2025-03-31', 'dia')),
  ('clients', public.dashboard_clients('2025-03-01', '2025-03-31', 'dia')),
  ('workshops', public.dashboard_workshops('2025-03-01', '2025-03-31', 7)),
  ('sellers', public.dashboard_sellers('2025-03-01', '2025-03-31')),
  ('quotes', public.dashboard_quotes('2025-03-01', '2025-03-31', 'dia')),
  ('summary_vacio', public.dashboard_summary('2024-01-01', '2024-01-31', 'dia')),
  ('summary_final', public.dashboard_summary('2025-04-01', '2025-04-01', 'dia'));
reset role;

-- Resumen
select is((select (j->>'sold')::numeric from res where name = 'summary'), 420::numeric,
  'vendido: 100 + 80 (3 × 26.66 con techo) + 200 (22:00 del 31/03 en Lima) + 40; sin anulada, sin consulta ni la del 1/04');
select is((select (j->>'sold_orders')::int from res where name = 'summary'), 3, 'guías con ventas: R1, R2 y la de WhatsApp');
select is((select (j->>'sold_pieces')::int from res where name = 'summary'), 4, 'piezas vendidas');
select is((select (j->>'ticket')::numeric from res where name = 'summary'), 140::numeric, 'ticket promedio = 420 / 3');
select is((select (j->>'collected')::numeric from res where name = 'summary'), 130::numeric, 'cobrado: 100 + 50 − 20 de reembolso; el pago del 1/04 queda fuera');
select is((select (j->>'refunds')::numeric from res where name = 'summary'), 20::numeric, 'reembolsos del periodo');
select is((select (j->>'balance_due')::numeric from res where name = 'summary') - (select due from base), 350::numeric,
  'saldo por cobrar: 50 (R1) + 170 (R2) + 40 (WhatsApp) + 90 (anterior); la guía Registrada no cuenta');
select is((select (j->>'orders')::int from res where name = 'summary'), 4, 'guías Normales registradas (sin la interna)');
select is((select (j->>'delivered')::int from res where name = 'summary'), 1, 'piezas entregadas');
select is((select (j->>'fulfillment_avg')::numeric from res where name = 'summary'), 6.0, 'cumplimiento promedio: 2 → 8 de marzo = 6 días');
select is((select (j->>'new_clients')::int from res where name = 'summary'), 2, 'clientes nuevos');
select is((select (j->>'cwa_conversion')::numeric from res where name = 'summary'), 33.3, 'conversión de cotizaciones WhatsApp: 1 de 3');
select is((select (j->>'margin')::numeric from res where name = 'summary'), 235::numeric, 'margen del admin: (100 − 40) + (200 − 25); solo cuentan las piezas con costo');
select is((select (j->>'margin_pct')::numeric from res where name = 'summary'), 78.3, '% de margen');
select is((select jsonb_array_length(j->'series') from res where name = 'summary'), 31, 'serie diaria sin huecos: 31 días');
select is((select sum((e->>'vendido')::numeric) from res, jsonb_array_elements(j->'series') e where name = 'summary'), 420::numeric,
  'la serie suma lo vendido');
select is((select jsonb_array_length(j->'series') from res where name = 'summary_semana'), 6, 'semanas (desde el lunes 24/02)');
select is((select jsonb_array_length(j->'series') from res where name = 'summary_mes'), 1, 'un solo mes');
select is((select (j->>'sold')::numeric from res where name = 'summary_vacio'), 0::numeric, 'un rango sin datos devuelve ceros');
select is((select (j->>'cwa_conversion') from res where name = 'summary_vacio'), null, 'sin cotizaciones no hay conversión');
select is((select (j->>'sold')::numeric from res where name = 'summary_final'), 70::numeric, 'el 1/04 en Lima solo está P5 (70)');

-- Ventas
select is((select (j->>'collection_rate')::numeric from res where name = 'sales'), 31.0, 'cobranza = 130 / 420');
select is((select j->'by_method' from res where name = 'sales'),
  '[{"label":"Efectivo","value":80.00},{"label":"Yape","value":50.00}]'::jsonb, 'cobrado por método (Efectivo neto de reembolso)');
select is((select j->'by_origin' from res where name = 'sales'),
  '[{"key":"oficina","sold":380.00,"orders":2,"ticket":190.00},{"key":"whatsapp","sold":40.00,"orders":1,"ticket":40.00}]'::jsonb,
  'vendido por origen');
select is((select j->'by_service' from res where name = 'sales'),
  '[{"label":"Sin servicio","value":240.00},{"label":"Baño dash","value":140.00},{"label":"Pulido dash","value":40.00}]'::jsonb,
  'vendido por servicio (la pieza con dos servicios reparte su importe)');
select is((select j->'by_material'->0 from res where name = 'sales'),
  '{"label":"Sin material","value":320.00}'::jsonb, 'vendido por material');
select is((select j->'margin' from res where name = 'sales'),
  '{"margin":235.00,"base":300.00,"cost":65.00,"pieces":2,"pieces_without_cost":2}'::jsonb, 'margen de ventas (admin)');

-- Pedidos
select is((select j->'by_status' from res where name = 'orders'),
  '[{"key":"aprobada","value":3},{"key":"registrada","value":1}]'::jsonb, 'guías por estado');
select is((select j->'by_kind' from res where name = 'orders'),
  '[{"key":"normal","value":4},{"key":"interno","value":1}]'::jsonb, 'guías por tipo');
select is((select j->'funnel' from res where name = 'orders'),
  '{"registered":7,"approved":6,"delivered":1,"in_consultation":1,"rejected":0,"no_fix":0,"cancelled":1,"urgent":1}'::jsonb,
  'embudo de piezas registradas en el rango');
select is((select (j->'fulfillment'->>'median')::numeric from res where name = 'orders'), 6.0, 'mediana de cumplimiento');
select is((select j->'fulfillment'->'buckets'->1 from res where name = 'orders'),
  '{"label":"4–7 días","value":1}'::jsonb, 'distribución del cumplimiento');
select is((select (j->>'pieces_per_order')::numeric from res where name = 'orders'), 1.8, 'piezas por guía (7 / 4)');

-- Clientes
select is((select (j->>'new_clients')::int from res where name = 'clients'), 2, 'clientes nuevos del periodo');
select is((select j->'new_by_kind' from res where name = 'clients'),
  '[{"key":"persona","value":1},{"key":"empresa","value":1}]'::jsonb, 'nuevos por tipo');
select is((select (j->>'active_in_range')::int from res where name = 'clients'), 3, 'clientes con guías en el periodo');
select is((select (j->>'returning')::int from res where name = 'clients'), 1, 'recurrentes: C1 ya tenía una guía antes');
select is((select (j->>'repeat_rate')::numeric from res where name = 'clients'), 33.3, 'tasa de recompra');
select is((select j->'top_clients'->0->>'name' from res where name = 'clients'), 'Empresa Dos SAC', 'el mejor cliente es el que más compró (240)');
select is((select (j->'top_clients'->0->>'sold')::numeric from res where name = 'clients'), 240::numeric, 'vendido al mejor cliente');
select is((select j->'regions' from res where name = 'clients'),
  '[{"region":"ARE","orders":2,"clients":1,"sold":240.00},{"region":"LIM","orders":1,"clients":1,"sold":180.00}]'::jsonb,
  'ventas por región');
select is((select (e->>'due')::numeric from res, jsonb_array_elements(j->'top_debtors') e
  where name = 'clients' and e->>'id' = '00000000-0000-0000-0000-0000000055c2'), 210::numeric, 'deuda de C2: 170 + 40');

-- Talleres
select is((select (e->>'returned')::int from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e1'), 2, 'Taller Uno: 2 piezas devueltas');
select is((select (e->>'avg_days')::numeric from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e1'), 4.5, 'Taller Uno: promedio 4.5 días');
select is((select (e->>'median_days')::numeric from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e1'), 4.5, 'Taller Uno: mediana 4.5 días');
select is((select (e->>'cost')::numeric from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e1'), 40::numeric, 'Taller Uno: el admin ve el costo');
select is((select (e->>'avg_days')::numeric from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e2'), 12.0, 'Taller Dos: 12 días');
select is((select (e->>'observed')::int from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e2'), 1, 'Taller Dos: una pieza observada');
select is((select (e->>'over_alert')::int from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e2'), 1, 'Taller Dos: una pieza lleva 7 días o más');
select is((select (e->>'max_now_days')::int from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e2'), 10, 'Taller Dos: la más antigua lleva 10 días');
select is((select (j->'total'->>'avg_days')::numeric from res where name = 'workshops'), 7.0, 'promedio general (3 + 6 + 12) / 3');
select is((select (j->'total'->>'median_days')::numeric from res where name = 'workshops'), 6.0, 'mediana general');

-- Vendedores (admin: todos)
select is((select j->>'scope' from res where name = 'sellers'), 'todos', 'el admin ve todos los vendedores');
select is((select e - 'id' from res, jsonb_array_elements(j->'sellers') e
  where name = 'sellers' and e->>'id' = '00000000-0000-0000-0000-0000000055a2'),
  '{"name":"Vera Ventas","orders":2,"sold":180.00,"ticket":180.00,"pieces":4,"approved":3,"collected":130.00,"is_self":false,"sold_orders":1,"approval_rate":75.0,"cwa_created":1,"cwa_converted":0}'::jsonb,
  'Vera: 2 guías, vendió 180, cobró 130, aprobó 3 de 4 piezas');
select is((select e - 'id' from res, jsonb_array_elements(j->'sellers') e
  where name = 'sellers' and e->>'id' = '00000000-0000-0000-0000-0000000055a3'),
  '{"name":"Víctor Ventas","orders":2,"sold":240.00,"ticket":120.00,"pieces":3,"approved":3,"collected":0,"is_self":false,"sold_orders":2,"approval_rate":100.0,"cwa_created":2,"cwa_converted":1}'::jsonb,
  'Víctor: 2 guías, vendió 240, nada cobrado en el periodo, 1 de 2 cotizaciones convertida');

-- Cotizaciones
select is((select j->'cwa' from res where name = 'quotes'),
  '{"created":3,"cotizada":1,"pedida_parcial":1,"pedida":0,"descartada":1,"quoted_amount":111.00,"items_quoted":4,"items_ordered":1,"ordered_amount":40.00,"conversion":33.3,"item_conversion":25.0}'::jsonb,
  'embudo de cotizaciones de WhatsApp');
select is((select j->'discard_reasons' from res where name = 'quotes'),
  '[{"label":"muy caro","value":1}]'::jsonb, 'motivos de descarte normalizados');
select is((select j->'cot'->>'acceptance' from res where name = 'quotes'), '33.3', 'cotizador: 1 aceptada de 3 no borrador');
select is((select (j->'cot'->>'vencida')::int from res where name = 'quotes'), 2, 'cotizador: las emitidas de 2025 ya vencieron');
select is((select (j->'cot'->>'borrador')::int from res where name = 'quotes'), 1, 'cotizador: un borrador');

-- ---------------------------------------------------------------------------------------
-- Permisos por rol
-- ---------------------------------------------------------------------------------------
delete from res;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a2","role":"authenticated"}', true);
insert into res values
  ('summary', public.dashboard_summary('2025-03-01', '2025-03-31', 'dia')),
  ('sales', public.dashboard_sales('2025-03-01', '2025-03-31', 'dia')),
  ('workshops', public.dashboard_workshops('2025-03-01', '2025-03-31', 7)),
  ('sellers', public.dashboard_sellers('2025-03-01', '2025-03-31'));
reset role;
select is((select j->>'margin' from res where name = 'summary'), null, 'ventas no ve el margen del resumen');
select is((select j->>'margin' from res where name = 'sales'), null, 'ventas no ve el margen de ventas');
select is((select (j->>'sold')::numeric from res where name = 'summary'), 420::numeric, 'ventas sí ve lo vendido');
select is((select (e->>'cost') from res, jsonb_array_elements(j->'workshops') e
  where name = 'workshops' and e->>'id' = '00000000-0000-0000-0000-0000000055e1'), null, 'ventas no ve el costo de los talleres');
select is((select j->>'scope' from res where name = 'sellers'), 'propio', 'ventas solo ve su propio desempeño');
select is((select jsonb_agg(e->>'id') from res, jsonb_array_elements(j->'sellers') e where name = 'sellers'),
  '["00000000-0000-0000-0000-0000000055a2"]'::jsonb, 'y solo su fila');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a4","role":"authenticated"}', true);
select throws_ok($$ select public.dashboard_summary('2025-03-01', '2025-03-31') $$, '42501', null, 'logística no ve el dashboard');
select throws_ok($$ select public.dashboard_workshops('2025-03-01', '2025-03-31') $$, '42501', null, 'logística tampoco ve talleres');
reset role;
set local role anon;
select throws_ok($$ select public.dashboard_sales('2025-03-01', '2025-03-31') $$, '42501', null, 'sin sesión no se ejecuta');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a1","role":"authenticated"}', true);
select throws_ok($$ select public.dashboard_summary('2025-03-31', '2025-03-01') $$, '22023', null, 'rango invertido');
select throws_ok($$ select public.dashboard_summary('2020-01-01', '2025-03-01') $$, '22023', null, 'rango demasiado largo');
select throws_ok($$ select public.dashboard_summary('2025-03-01', '2025-03-31', 'hora') $$, '22023', null, 'agrupación inválida');
reset role;

select * from finish();
rollback;
