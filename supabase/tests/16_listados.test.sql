begin;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ca1', 'ventas@listados.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-000000000ca2', 'logistica@listados.test', '{"role":"logistica"}', '{}');

insert into public.workshops (id, name) values ('00000000-0000-0000-0000-00000000ca10', 'Taller Listados');
insert into public.clients (id, kind, first_name, last_name, document_type, document_number, shopify_customer_id) values
  ('00000000-0000-0000-0000-00000000ca20', 'persona', 'Listada', 'Uno', 'dni', '71717171', 'gid://shopify/Customer/ca20'),
  ('00000000-0000-0000-0000-00000000ca21', 'persona', 'Listada', 'Dos', null, null, 'gid://shopify/Customer/ca21');

insert into public.restorations (id, client_id, payment_type, created_at) values
  ('00000000-0000-0000-0000-00000000ca31', '00000000-0000-0000-0000-00000000ca20', 'contado', '2026-09-10T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000ca32', '00000000-0000-0000-0000-00000000ca21', 'credito', '2026-09-20T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000ca33', '00000000-0000-0000-0000-00000000ca21', 'contado', '2026-09-25T15:00:00Z');
insert into public.pieces (id, restoration_id, description, price, workshop_id) values
  ('00000000-0000-0000-0000-00000000ca41', '00000000-0000-0000-0000-00000000ca31', 'Fuente listada', 100, '00000000-0000-0000-0000-00000000ca10'),
  ('00000000-0000-0000-0000-00000000ca42', '00000000-0000-0000-0000-00000000ca32', 'Bandeja listada', 50, null),
  ('00000000-0000-0000-0000-00000000ca43', '00000000-0000-0000-0000-00000000ca33', 'Jarra entregada', 30, null);
update public.restorations set payment_status = 'pagado' where id = '00000000-0000-0000-0000-00000000ca31';
update public.restorations set status = 'completada' where id = '00000000-0000-0000-0000-00000000ca33';
update public.pieces set status = 'entregada' where id = '00000000-0000-0000-0000-00000000ca43';

-- Historial conocido: la fuente lleva 10 días en el taller.
update public.pieces set status = 'enviada_taller' where id = '00000000-0000-0000-0000-00000000ca41';
delete from public.piece_status_history where piece_id = '00000000-0000-0000-0000-00000000ca41';
insert into public.piece_status_history (piece_id, restoration_id, from_status, to_status, occurred_at) values
  ('00000000-0000-0000-0000-00000000ca41', '00000000-0000-0000-0000-00000000ca31', 'recibida', 'enviada_taller', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000ca42', '00000000-0000-0000-0000-00000000ca32', 'devuelta_taller', 'observada', now());
update public.piece_status_history set note = 'Falta brillo'
  where piece_id = '00000000-0000-0000-0000-00000000ca42' and to_status = 'observada';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca1","role":"authenticated"}', true);

select results_eq(
  $$ select client_name, total, total_count from public.list_restorations(p_query => 'Listada', p_sort => 'client', p_dir => 'asc') $$,
  $$ values ('Listada Dos', 30.00::numeric, 3::bigint), ('Listada Dos', 50.00::numeric, 3::bigint), ('Listada Uno', 100.00::numeric, 3::bigint) $$,
  'ventas ve todas, con montos, ordenadas por cliente'
);
select results_eq(
  $$ select code ~ '^RES-' from public.list_restorations(p_query => '71717171') $$,
  $$ values (true) $$,
  'busca por documento del cliente'
);
select is(
  (select count(*)::int from public.list_restorations(p_query => 'Listada', p_payment_status => 'pagado')),
  1, 'filtra por estado de pago'
);
select is(
  (select count(*)::int from public.list_restorations(p_query => 'Listada', p_workshop_id => '00000000-0000-0000-0000-00000000ca10')),
  1, 'filtra por taller de alguna pieza'
);
select is(
  (select count(*)::int from public.list_restorations(p_query => 'Listada', p_from => '2026-09-15', p_to => '2026-09-21')),
  1, 'filtra por rango de fechas (Lima)'
);
select results_eq(
  $$ select total_count from public.list_restorations(p_query => 'Listada', p_limit => 1, p_offset => 1) $$,
  $$ values (3::bigint) $$,
  'pagina y devuelve el total'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca2","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::int, count(total)::int, count(payment_status)::int
     from public.list_restorations(p_query => 'Listada') $$,
  $$ values (2, 0, 0) $$,
  'logística no ve restauraciones pasadas ni montos (P42, D24)'
);
select is(
  (select count(*)::int from public.list_restorations(p_query => 'Listada', p_payment_status => 'pagado')),
  0, 'logística no filtra por dinero'
);

select results_eq(
  $$ select description, workshop_days, workshop_ongoing from public.list_pieces_board(p_query => 'listada') $$,
  $$ values ('Fuente listada', 10, true), ('Bandeja listada', 0, false) $$,
  'la vista de piezas muestra las piezas en curso, primero las que llevan más días en el taller'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Jarra entregada')),
  0, 'no muestra piezas entregadas ni de restauraciones pasadas'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'listada', p_min_workshop_days => 7) $$,
  $$ values ('Fuente listada') $$,
  'filtra por días en taller'
);
select results_eq(
  $$ select last_observation from public.list_pieces_board(p_query => 'Bandeja listada') $$,
  $$ values ('Falta brillo') $$,
  'trae la nota de la última observación'
);

select * from finish();
rollback;
