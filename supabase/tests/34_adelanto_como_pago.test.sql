begin;

select plan(5);

-- El adelanto con que se registra la restauración es un pago real, aunque las piezas
-- aún no tengan precio (total 0, D58).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ee1', 'ventas@adelanto.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000ee20', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type, deposit_amount) values
  ('00000000-0000-0000-0000-00000000ee30', '00000000-0000-0000-0000-00000000ee20', 'a_cuenta', 100);
insert into public.pieces (restoration_id, description)
  values ('00000000-0000-0000-0000-00000000ee30', 'Fuente sin precio');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ee1","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.payments (restoration_id, amount, payment_method_id) values
       ('00000000-0000-0000-0000-00000000ee30', 100,
        (select id from public.payment_methods where name = 'Yape')) $$,
  'el adelanto se registra aunque aún no haya precios'
);
select results_eq(
  $$ select total, paid, payment_status::text from public.restorations
     where id = '00000000-0000-0000-0000-00000000ee30' $$,
  $$ values (0.00::numeric, 100.00::numeric, 'parcial') $$,
  'cuenta como pagado y queda Parcial (no Pagado) sin total'
);
select is(
  (select count(*)::int from public.payments where restoration_id = '00000000-0000-0000-0000-00000000ee30'),
  1, 'aparece en los pagos de la restauración'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, amount, method_name) values
       ('00000000-0000-0000-0000-00000000ee30', 1, 'Efectivo') $$,
  '23514', 'El monto supera el saldo pendiente', 'más allá del adelanto sigue valiendo el saldo'
);
select throws_ok(
  $$ update public.restorations set deposit_amount = 150
     where id = '00000000-0000-0000-0000-00000000ee30' $$,
  '23514', 'Con pagos registrados ya no se cambia el adelanto: los cobros van en Pagos.',
  'con el adelanto cobrado ya no se cambia'
);

select * from finish();
rollback;
