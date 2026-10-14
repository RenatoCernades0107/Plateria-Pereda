begin;

select plan(6);

-- Estas pruebas no tratan pagos: se entrega como si el saldo estuviera confirmado (P45).
select set_config('app.deliver_with_balance', 'on', true);

-- Vista de piezas: las entregadas hoy siguen a la vista; el historial guarda las demás.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000db1', 'admin@historial.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-000000000db2', 'logistica@historial.test', '{"role":"logistica"}', '{}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000db20', 'persona', 'Historial');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000db30', '00000000-0000-0000-0000-00000000db20', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000db41', '00000000-0000-0000-0000-00000000db30', 'Hoy historial', 10),
  ('00000000-0000-0000-0000-00000000db42', '00000000-0000-0000-0000-00000000db30', 'Antes historial', 10),
  ('00000000-0000-0000-0000-00000000db43', '00000000-0000-0000-0000-00000000db30', 'En curso historial', 10);
update public.pieces set status = 'entregada', delivered_at = now()
  where id = '00000000-0000-0000-0000-00000000db41';
update public.pieces set status = 'entregada', delivered_at = now() - interval '3 days'
  where id = '00000000-0000-0000-0000-00000000db42';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000db1","role":"authenticated"}', true);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'historial') order by description $$,
  $$ values ('En curso historial'), ('Hoy historial') $$,
  'la vista muestra las piezas en curso y las entregadas hoy, no las de días anteriores'
);
select is(
  (select description from public.list_pieces_board(p_query => 'historial') offset 1 limit 1),
  'Hoy historial', 'las entregadas hoy van al final'
);
select results_eq(
  $$ select description from public.list_pieces_history(p_query => 'historial') $$,
  $$ values ('Hoy historial'), ('Antes historial') $$,
  'el historial tiene las entregadas, de la más reciente a la más antigua'
);
select results_eq(
  $$ select description from public.list_pieces_history(
       p_query => 'historial',
       p_from => (now() at time zone 'America/Lima')::date - 5,
       p_to => (now() at time zone 'America/Lima')::date - 1) $$,
  $$ values ('Antes historial') $$,
  'filtra por la fecha de entrega (hora de Lima)'
);
select is(
  (select count(*)::int from public.list_pieces_history(p_query => 'historial', p_status => 'anulada')),
  0, 'filtra por estado'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000db2","role":"authenticated"}', true);
select is(
  (select price from public.list_pieces_history(p_query => 'Antes historial')),
  null, 'logística no ve el precio de venta en el historial'
);

select * from finish();
rollback;
