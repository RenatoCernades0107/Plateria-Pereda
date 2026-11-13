begin;

select plan(26);

-- Cotizaciones (2026-11-11): ubicación del trabajo y taller (solo en aceptadas y
-- facturadas), seguimiento de logística por RPC sin dinero y pagos con N.º de factura.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000073a1', 'admin@seguimiento.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000073a2', 'ventas@seguimiento.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000073a3', 'logistica@seguimiento.test', '{"role":"logistica"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000073c1', 'persona', 'Ana', 'Seguimiento');
insert into public.workshops (id, name, active) values
  ('00000000-0000-0000-0000-0000000073b1', 'Taller seguimiento', true),
  ('00000000-0000-0000-0000-0000000073b2', 'Taller inactivo seguimiento', false);

select has_column('public', 'quotes', 'work_location', 'la cotización guarda la ubicación del trabajo');
select has_column('public', 'quotes', 'workshop_id', 'y el taller');
select has_table('public', 'quote_payments', 'hay pagos de cotización');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000073a2","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000073c1"}',
  '[{"title":"Anillo","quantity":2,"unit_price":"100.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');

-- En una emitida no hay ubicación ni pagos.
select throws_ok(
  $$ select public.update_quote_tracking((select id from ids where name = 'q'), false, null, true, 'en_taller') $$,
  '23514', null, 'una emitida no tiene ubicación'
);
select throws_ok(
  $$ insert into public.quote_payments (quote_id, amount, method_name)
     values ((select id from ids where name = 'q'), 10, 'Efectivo') $$,
  '23514', null, 'una emitida no recibe pagos'
);

update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q');

-- Ubicación: ventas la cambia; el taller, no.
select lives_ok(
  $$ select public.update_quote_tracking((select id from ids where name = 'q'), false, null, true, 'en_taller') $$,
  'ventas cambia la ubicación'
);
select is(
  (select work_location::text from public.quotes where id = (select id from ids where name = 'q')),
  'en_taller', 'la ubicación queda guardada'
);
select throws_ok(
  $$ select public.update_quote_tracking((select id from ids where name = 'q'), true, '00000000-0000-0000-0000-0000000073b1', false, null) $$,
  '42501', null, 'ventas no asigna el taller'
);

-- Pagos.
select lives_ok(
  $$ insert into public.quote_payments (quote_id, amount, method_name, invoice_number)
     values ((select id from ids where name = 'q'), 120, 'Efectivo', '  F001-1  ') $$,
  'ventas registra un pago de una aceptada'
);
select is(
  (select invoice_number from public.quote_payments),
  'F001-1', 'el número de factura se guarda sin espacios'
);
select throws_ok(
  $$ insert into public.quote_payments (quote_id, amount, method_name)
     values ((select id from ids where name = 'q'), 300, 'Efectivo') $$,
  '23514', null, 'un pago no pasa del saldo'
);
select lives_ok(
  $$ update public.quote_payments set invoice_number = 'F001-2' $$,
  'se cambia el número de factura'
);
select throws_ok(
  $$ update public.quote_payments set amount = 5 $$,
  '42501', null, 'el monto de un pago no se edita'
);
select lives_ok(
  $$ delete from public.quote_payments $$,
  'ventas no falla al borrar (no ve filas que borrar)'
);
select is((select count(*)::int from public.quote_payments), 1, 'ventas no elimina pagos');

-- Con pagos no deja de estar aceptada.
select throws_ok(
  $$ update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q') $$,
  '23514', null, 'con pagos no vuelve a emitida'
);
select lives_ok(
  $$ update public.quotes set status = 'facturada' where id = (select id from ids where name = 'q') $$,
  'con pagos sí pasa a facturada'
);
select is(
  (select work_location::text from public.quotes where id = (select id from ids where name = 'q')),
  'en_taller', 'la facturada conserva la ubicación'
);

-- Logística: sin leer la tabla; ve las aprobadas sin dinero y asigna el taller.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000073a3","role":"authenticated"}', true);

select is((select count(*)::int from public.quotes), 0, 'logística no lee la tabla de cotizaciones');
select is((select count(*)::int from public.quote_payments), 0, 'ni los pagos');
select is(
  (select count(*)::int from public.list_logistics_quotes() where client_name = 'Ana Seguimiento'),
  1, 'logística ve la cotización aprobada por el RPC'
);
select ok(
  not ((public.get_logistics_quote((select id from public.list_logistics_quotes() limit 1))) ? 'total'),
  'el detalle para logística no lleva el total'
);
select throws_ok(
  $$ select public.update_quote_tracking((select id from public.list_logistics_quotes() limit 1), true, '00000000-0000-0000-0000-0000000073b2', false, null) $$,
  '23503', null, 'no se asigna un taller desactivado'
);
select lives_ok(
  $$ select public.update_quote_tracking((select id from public.list_logistics_quotes() limit 1), true, '00000000-0000-0000-0000-0000000073b1', true, 'entregado') $$,
  'logística asigna el taller y la ubicación'
);

-- Admin: elimina el pago.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000073a1","role":"authenticated"}', true);
delete from public.quote_payments;
select is((select count(*)::int from public.quote_payments), 0, 'el admin elimina el pago');

-- Sin pagos, al volver a emitida se borran el taller y la ubicación.
insert into ids select 'q2', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000073c1"}',
  '[{"title":"Collar","quantity":1,"unit_price":"50.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q2');
update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q2');
select public.update_quote_tracking((select id from ids where name = 'q2'), true,
  '00000000-0000-0000-0000-0000000073b1', true, 'en_tienda');
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q2');
select is(
  (select (work_location, workshop_id)::text from public.quotes where id = (select id from ids where name = 'q2')),
  '(,)', 'al volver a emitida se borran el taller y la ubicación'
);

select * from finish();
rollback;
