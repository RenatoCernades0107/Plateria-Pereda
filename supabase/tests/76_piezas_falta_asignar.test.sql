begin;

select plan(12);

-- Filtro "Falta asignar" de la vista de piezas (p_missing): sin precio y/o sin costo de
-- servicio. 0 cuenta como asignado; varias opciones se suman; ventas no filtra por costo.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fa1', 'admin@falta.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-000000000fa2', 'logistica@falta.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-000000000fa3', 'ventas@falta.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000fa20', 'persona', 'Rosa');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000fa30', '00000000-0000-0000-0000-00000000fa20', 'contado');
insert into public.services (name) values ('Limpieza') on conflict do nothing;
insert into public.materials (name) values ('Plata') on conflict do nothing;
-- completa: ambos; sin precio: falta el precio; sin costo: falta el costo; costo cero:
-- el 0 cuenta como asignado; nada: faltan los dos.
insert into public.pieces (id, restoration_id, description, service_name, material_name, price, service_cost) values
  ('00000000-0000-0000-0000-00000000fa41', '00000000-0000-0000-0000-00000000fa30', 'Falta completa', 'Limpieza', 'Plata', 100, 30),
  ('00000000-0000-0000-0000-00000000fa42', '00000000-0000-0000-0000-00000000fa30', 'Falta sin precio', 'Limpieza', 'Plata', null, 30),
  ('00000000-0000-0000-0000-00000000fa43', '00000000-0000-0000-0000-00000000fa30', 'Falta sin costo', 'Limpieza', 'Plata', 100, null),
  ('00000000-0000-0000-0000-00000000fa44', '00000000-0000-0000-0000-00000000fa30', 'Falta costo cero', 'Limpieza', 'Plata', 100, 0),
  ('00000000-0000-0000-0000-00000000fa45', '00000000-0000-0000-0000-00000000fa30', 'Falta nada', 'Limpieza', 'Plata', null, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa1","role":"authenticated"}', true);

select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['precio']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin precio') $$,
  'admin: "precio" trae las piezas sin precio'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['costo']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin costo') $$,
  'admin: "costo" trae las piezas sin costo de servicio (el 0 cuenta como asignado)'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['precio', 'costo']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin costo'), ('Falta sin precio') $$,
  'admin: varias opciones se suman (OR)'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Falta', p_missing => array[]::text[])),
  5, 'una lista vacía no filtra'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Falta')),
  5, 'sin p_missing no filtra'
);
select is(
  (select total_count from public.list_pieces_board(p_query => 'Falta', p_missing => array['precio', 'costo'], p_limit => 1)),
  3::bigint, 'el total cuenta las piezas que cumplen el filtro'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa2","role":"authenticated"}', true);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['costo']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin costo') $$,
  'logística filtra por costo'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['precio']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin precio') $$,
  'logística filtra por precio'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa3","role":"authenticated"}', true);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['precio']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin precio') $$,
  'ventas filtra por precio (lo ve)'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'Falta', p_missing => array['costo'])),
  0, 'ventas filtrando por costo no recibe nada: no puede deducir qué piezas tienen costo'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Falta', p_missing => array['precio', 'costo']) order by description $$,
  $$ values ('Falta nada'), ('Falta sin precio') $$,
  'ventas con ambas opciones: solo cuenta la de precio'
);

reset role;
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_pieces_board'),
  1, 'queda una sola firma de list_pieces_board'
);

select * from finish();
rollback;
