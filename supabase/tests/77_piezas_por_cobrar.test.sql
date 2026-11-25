begin;

select plan(7);

-- Filtro "Listas por cobrar" de la vista de piezas (p_to_collect): piezas listas para
-- entregar de guías Normales que aún deben dinero (pago pendiente o parcial). Mismas piezas
-- que cuenta `ready_to_collect` del dashboard. Solo admin y ventas (quienes ven los montos).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fb1', 'admin@cobrar.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-000000000fb2', 'logistica@cobrar.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-000000000fb3', 'ventas@cobrar.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000fb20', 'persona', 'Lucía');
-- Debe: sin pagos. Parcial: pagó una parte. Pagada: pagó todo.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000fb31', '00000000-0000-0000-0000-00000000fb20', 'contado'),
  ('00000000-0000-0000-0000-00000000fb32', '00000000-0000-0000-0000-00000000fb20', 'contado'),
  ('00000000-0000-0000-0000-00000000fb33', '00000000-0000-0000-0000-00000000fb20', 'contado');
insert into public.services (name) values ('Limpieza') on conflict do nothing;
insert into public.materials (name) values ('Plata') on conflict do nothing;
insert into public.pieces (id, restoration_id, description, service_name, material_name, price, status) values
  ('00000000-0000-0000-0000-00000000fb41', '00000000-0000-0000-0000-00000000fb31', 'Cobrar debe', 'Limpieza', 'Plata', 100, 'aprobada'),
  ('00000000-0000-0000-0000-00000000fb42', '00000000-0000-0000-0000-00000000fb32', 'Cobrar parcial', 'Limpieza', 'Plata', 100, 'aprobada'),
  ('00000000-0000-0000-0000-00000000fb43', '00000000-0000-0000-0000-00000000fb33', 'Cobrar pagada', 'Limpieza', 'Plata', 100, 'aprobada'),
  ('00000000-0000-0000-0000-00000000fb44', '00000000-0000-0000-0000-00000000fb31', 'Cobrar en taller', 'Limpieza', 'Plata', 100, 'aprobada');
-- Volvieron del taller (listas) las tres primeras; la cuarta sigue allá.
update public.pieces set first_sent_at = now() - interval '5 days', last_sent_at = now() - interval '5 days',
  last_returned_at = now() - interval '1 day'
  where id in ('00000000-0000-0000-0000-00000000fb41', '00000000-0000-0000-0000-00000000fb42', '00000000-0000-0000-0000-00000000fb43');
update public.pieces set first_sent_at = now() - interval '5 days', last_sent_at = now() - interval '5 days', last_returned_at = null
  where id = '00000000-0000-0000-0000-00000000fb44';
insert into public.payments (restoration_id, amount, method_name) values
  ('00000000-0000-0000-0000-00000000fb32', 40, 'Efectivo'),
  ('00000000-0000-0000-0000-00000000fb33', 100, 'Efectivo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fb1","role":"authenticated"}', true);

select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Cobrar', p_to_collect => true) order by description $$,
  $$ values ('Cobrar debe'), ('Cobrar parcial') $$,
  'admin: solo las listas de guías con pago pendiente o parcial (no la pagada ni la que sigue en el taller)'
);
select is(
  (select total_count from public.list_pieces_board(p_query => 'Cobrar', p_to_collect => true, p_limit => 1)),
  2::bigint, 'el total cuenta las piezas que cumplen el filtro'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Cobrar')),
  4, 'sin p_to_collect no filtra'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Cobrar', p_to_collect => false)),
  4, 'p_to_collect en falso no filtra'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fb3","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Cobrar', p_to_collect => true)),
  2, 'ventas ve los montos: también filtra por cobrar'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fb2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Cobrar', p_to_collect => true)),
  0, 'logística no ve los pagos: el filtro no rinde'
);

reset role;
select is(
  (select count(*)::int from pg_proc where proname = 'list_pieces_board' and pronamespace = 'public'::regnamespace),
  1, 'queda una sola firma de list_pieces_board'
);

select * from finish();
rollback;
