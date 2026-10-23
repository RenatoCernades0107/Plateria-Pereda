begin;

select plan(24);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000dd1', 'ventas@pagos.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000dd2', 'logistica@pagos.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-000000000dd3', 'admin@pagos.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000dd20', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type, deposit_percent) values
  ('00000000-0000-0000-0000-00000000dd30', '00000000-0000-0000-0000-00000000dd20', 'a_cuenta', 50);
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000dd40', '00000000-0000-0000-0000-00000000dd30', 'Fuente', 300),
  ('00000000-0000-0000-0000-00000000dd41', '00000000-0000-0000-0000-00000000dd30', 'Jarra', 100);

-- Función de estado (P29), igual que derivePaymentStatus().
select is(private.payment_status_for(400, 0, 0), 'pendiente', 'nada pagado → Pendiente');
select is(private.payment_status_for(400, 200, 0), 'parcial', 'una parte → Parcial');
select is(private.payment_status_for(400, 400, 0), 'pagado', 'todo → Pagado');
select is(private.payment_status_for(400, 450, 0), 'pagado', 'sobrepago → Pagado');
select is(private.payment_status_for(400, 0, 200), 'reembolsado', 'se devolvió todo → Reembolsado');
select is(private.payment_status_for(400, 100, 100), 'parcial', 'reembolso parcial → Parcial');
select is(private.payment_status_for(0, 0, 0), 'pendiente', 'total 0 → Pendiente');
select is(private.payment_status_for(0, 100, 0), 'parcial', 'adelanto sin precios (total 0) → Parcial');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000dd1","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.payments (restoration_id, amount, payment_method_id) values
       ('00000000-0000-0000-0000-00000000dd30', 200,
        (select id from public.payment_methods where name = 'Yape')) $$,
  'ventas registra el adelanto'
);
select results_eq(
  $$ select paid, balance, payment_status::text from public.restorations
     where id = '00000000-0000-0000-0000-00000000dd30' $$,
  $$ values (200.00::numeric, 200.00::numeric, 'parcial') $$,
  'se recalcula pagado, saldo y estado'
);
select results_eq(
  $$ select method_name, created_by_name from public.payments
     where restoration_id = '00000000-0000-0000-0000-00000000dd30' $$,
  $$ values ('Yape', 'Vera Ventas') $$,
  'guarda el método y quién lo registró'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, amount, method_name) values
       ('00000000-0000-0000-0000-00000000dd30', 250, 'Efectivo') $$,
  '23514', 'El monto supera el saldo pendiente', 'no se paga más que el saldo'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id) values
       ('00000000-0000-0000-0000-00000000dd30', 'reembolso', 50, 'Efectivo', 'Error',
        (select id from public.payments where restoration_id = '00000000-0000-0000-0000-00000000dd30' and method_name = 'Yape')) $$,
  '42501', null, 'ventas no registra reembolsos'
);
select throws_ok(
  $$ update public.restorations set payment_type = 'contado', deposit_percent = null
     where id = '00000000-0000-0000-0000-00000000dd30' $$,
  '23514', 'Con pagos registrados ya no se cambia el tipo de pago', 'P28: con pagos el tipo de pago queda fijo'
);
select throws_ok(
  $$ update public.restorations set deposit_percent = 60
     where id = '00000000-0000-0000-0000-00000000dd30' $$,
  '23514', 'Con pagos registrados ya no se cambia el adelanto: los cobros van en Pagos.',
  'con pagos el adelanto queda fijo'
);
select lives_ok(
  $$ update public.restorations set deposit_percent = null, deposit_amount = 200, notes = 'ok'
     where id = '00000000-0000-0000-0000-00000000dd30' $$,
  'lo demás sí se edita (el mismo adelanto, ahora en soles)'
);
select throws_ok(
  $$ update public.payments set amount = 1 $$,
  '42501', null, 'un pago no se edita'
);

select lives_ok(
  $$ insert into public.payments (restoration_id, amount, method_name) values
       ('00000000-0000-0000-0000-00000000dd30', 200, 'Efectivo') $$,
  'el saldo completa el pago'
);
select is(
  (select payment_status::text from public.restorations where id = '00000000-0000-0000-0000-00000000dd30'),
  'pagado', 'queda Pagado'
);

-- Logística no ve pagos (P42).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000dd2","role":"authenticated"}', true);
select is((select count(*)::int from public.payments), 0, 'logística no lee pagos');

-- El admin corrige con un reembolso con motivo.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000dd3","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, refunded_payment_id) values
       ('00000000-0000-0000-0000-00000000dd30', 'reembolso', 50, 'Efectivo',
        (select id from public.payments where restoration_id = '00000000-0000-0000-0000-00000000dd30' and method_name = 'Yape')) $$,
  '23514', null, 'el reembolso exige motivo'
);
select lives_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id) values
       ('00000000-0000-0000-0000-00000000dd30', 'reembolso', 200, 'Yape', 'Se anuló el trabajo',
        (select id from public.payments where restoration_id = '00000000-0000-0000-0000-00000000dd30' and method_name = 'Yape')),
       ('00000000-0000-0000-0000-00000000dd30', 'reembolso', 200, 'Efectivo', 'Se anuló el trabajo',
        (select id from public.payments where restoration_id = '00000000-0000-0000-0000-00000000dd30' and method_name = 'Efectivo' and kind = 'pago')) $$,
  'el admin reembolsa todo (cada pago en su pedido)'
);
select results_eq(
  $$ select paid, payment_status::text from public.restorations
     where id = '00000000-0000-0000-0000-00000000dd30' $$,
  $$ values (0.00::numeric, 'reembolsado') $$,
  'queda Reembolsado'
);

-- Si cambia el total, cambia el estado: con S/ 200 pagados y una pieza más.
reset role;
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-00000000dd30', 400, 'Efectivo');
insert into public.pieces (restoration_id, description, price)
  values ('00000000-0000-0000-0000-00000000dd30', 'Bandeja', 100);
select is(
  (select payment_status::text from public.restorations where id = '00000000-0000-0000-0000-00000000dd30'),
  'parcial', 'al subir el total, Pagado pasa a Parcial'
);

select * from finish();
rollback;
