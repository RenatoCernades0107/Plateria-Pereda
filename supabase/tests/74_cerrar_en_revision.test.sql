begin;

select plan(16);

-- Cerrar la pieza con la revisión en taller abierta (2026-11-13): rechazar (el cliente),
-- anular y "No tiene arreglo" (el taller avisa) son decisiones sobre la pieza, no sobre
-- dónde está. La pieza queda cerrada y En taller hasta marcar "Volvió de revisión"; solo
-- entonces se devuelve al cliente.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000074a1', 'ventas@cerrar.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000074a2', 'logistica@cerrar.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000074a3', 'admin@cerrar.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.workshops (id, name) values
  ('00000000-0000-0000-0000-0000000074b1', 'Taller Cierre');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000074c1', 'persona', 'Rita');
-- Oficina: las piezas nacen en la tienda.
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-0000000074d1', '00000000-0000-0000-0000-0000000074c1', 'contado');
-- E1: el cliente rechaza. E2: el taller avisa que no tiene arreglo. E3: se anula.
insert into public.pieces (id, restoration_id, description, price, service_cost) values
  ('00000000-0000-0000-0000-0000000074e1', '00000000-0000-0000-0000-0000000074d1', 'Fuente', 100, 40),
  ('00000000-0000-0000-0000-0000000074e2', '00000000-0000-0000-0000-0000000074d1', 'Jarra', 100, 40),
  ('00000000-0000-0000-0000-0000000074e3', '00000000-0000-0000-0000-0000000074d1', 'Bandeja', 100, 40);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000074a1","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::int from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000074e1', '00000000-0000-0000-0000-0000000074e2',
             '00000000-0000-0000-0000-0000000074e3']::uuid[], 'en_consulta', 'Revisar con el taller') $$,
  $$ values (3) $$,
  'ventas pone las piezas en Consulta'
);
select results_eq(
  $$ select count(*)::int from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000074e1', '00000000-0000-0000-0000-0000000074e3']::uuid[],
       'en_espera') $$,
  $$ values (2) $$,
  'E1 y E3 esperan la respuesta del cliente'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000074a2","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::int from public.send_pieces_for_review(
       array['00000000-0000-0000-0000-0000000074e1', '00000000-0000-0000-0000-0000000074e2',
             '00000000-0000-0000-0000-0000000074e3']::uuid[], '00000000-0000-0000-0000-0000000074b1') $$,
  $$ values (3) $$,
  'logística lleva las tres piezas a revisar'
);

-- El cliente rechaza con la pieza todavía en el taller.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000074a1","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000074e1']::uuid[], 'rechazada', 'No acepta el precio') $$,
  $$ values ('rechazada') $$,
  'en revisión el cliente rechaza la pieza'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000074e1'),
  'en_taller', 'rechazada en revisión sigue En taller'
);

-- El taller avisa que no tiene arreglo y se anula otra, ambas aún en el taller.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000074a3","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000074e2']::uuid[], 'sin_arreglo', 'No tiene arreglo') $$,
  $$ values ('sin_arreglo') $$,
  'en revisión se marca No tiene arreglo'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000074e2'),
  'en_taller', 'sin arreglo en revisión sigue En taller'
);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000074e3']::uuid[], 'anulada', 'Ya no va') $$,
  $$ values ('anulada') $$,
  'en revisión se anula la pieza'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000074e3'),
  'anulada', 'la anulada queda Anulada'
);

-- Aún en el taller: no se devuelve al cliente.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000074a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.return_pieces_to_client(array['00000000-0000-0000-0000-0000000074e1']::uuid[]) $$,
  '23514', 'La pieza ' || (select code from public.pieces_operational where id = '00000000-0000-0000-0000-0000000074e1')
    || ' sigue en el taller por revisión; marca primero que volvió.',
  'la rechazada en revisión no se devuelve al cliente'
);
select throws_ok(
  $$ select * from public.return_pieces_to_client(array['00000000-0000-0000-0000-0000000074e2']::uuid[]) $$,
  '23514', null, 'la sin arreglo en revisión no se devuelve al cliente'
);

-- Vuelve de la revisión: ya está en la tienda y se devuelve.
select results_eq(
  $$ select count(*)::int from public.receive_pieces_from_review(
       array['00000000-0000-0000-0000-0000000074e1', '00000000-0000-0000-0000-0000000074e2']::uuid[]) $$,
  $$ values (2) $$,
  'logística marca que volvieron de revisión'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000074e1'),
  'en_tienda', 'de vuelta de la revisión la rechazada está En tienda'
);
select results_eq(
  $$ select status::text from public.return_pieces_to_client(
       array['00000000-0000-0000-0000-0000000074e1']::uuid[]) $$,
  $$ values ('rechazada') $$,
  'de vuelta, la rechazada se devuelve al cliente'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000074e1'),
  'entregada', 'devuelta al cliente queda Entregada'
);

reset role;
select results_eq(
  $$ select event::text from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-0000000074e1' and event <> 'estado' order by id $$,
  $$ values ('envio_revision'), ('vuelta_revision'), ('devolucion_cliente') $$,
  'el historial guarda la revisión y la devolución, en ese orden'
);

select * from finish();
rollback;
