begin;

select plan(9);

-- Deshacer el rechazo del cliente (2026-11-11): a veces el cliente cambia de opinión. La
-- pieza rechazada se reactiva con "Retroceder estado" aunque ya se le haya devuelto, y el
-- estado general de la guía deja de ser Rechazada. La pieza sin arreglo devuelta no.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000073a1', 'ventas@rechazo.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000073c1', 'persona', 'Rita');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000073d1', '00000000-0000-0000-0000-0000000073c1', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000073e1', '00000000-0000-0000-0000-0000000073d1', 'Fuente', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000073a1","role":"authenticated"}', true);

-- Consulta → Espera → el cliente rechaza → llega a la tienda → se le devuelve.
select lives_ok(
  $$ select * from public.change_piece_status(
  array['00000000-0000-0000-0000-0000000073e1']::uuid[], 'en_consulta', 'Cotizar') $$,
  'la pieza pasa a Consulta'
);
select lives_ok(
  $$ select * from public.change_piece_status(
  array['00000000-0000-0000-0000-0000000073e1']::uuid[], 'en_espera') $$,
  'la pieza espera la respuesta del cliente'
);
select lives_ok(
  $$ select * from public.change_piece_status(
  array['00000000-0000-0000-0000-0000000073e1']::uuid[], 'rechazada', 'Muy caro') $$,
  'el cliente rechaza la pieza'
);
select lives_ok(
  $$ select * from public.mark_pieces_arrived(array['00000000-0000-0000-0000-0000000073e1']::uuid[]) $$,
  'la pieza llega a la tienda'
);
select lives_ok(
  $$ select * from public.return_pieces_to_client(array['00000000-0000-0000-0000-0000000073e1']::uuid[]) $$,
  'la pieza rechazada se devuelve al cliente'
);
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-0000000073d1'),
  'rechazada', 'la guía quedó Rechazada'
);

-- El cliente cambia de opinión: se retrocede el rechazo aunque ya se devolvió.
select results_eq(
  $$ select status::text from public.undo_piece_status(
     '00000000-0000-0000-0000-0000000073e1', 'El cliente cambió de opinión') $$,
  $$ values ('en_espera') $$,
  'la pieza rechazada y devuelta se reactiva en Espera respuesta cliente'
);
select results_eq(
  $$ select cancelled_at is null, returned_at is null, returned_by is null
     from public.pieces where id = '00000000-0000-0000-0000-0000000073e1' $$,
  $$ values (true, true, true) $$,
  'se deshace también la devolución al cliente'
);
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-0000000073d1'),
  'registrada', 'la guía deja de estar Rechazada'
);

select * from finish();
rollback;
