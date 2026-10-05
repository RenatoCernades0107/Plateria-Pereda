begin;

select plan(28);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000aa1', 'ventas@estados.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000aa2', 'logistica@estados.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-000000000aa3', 'admin@estados.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.workshops (id, name) values ('00000000-0000-0000-0000-00000000aa10', 'Taller Estados');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000aa20', 'persona', 'Ana', 'gid://shopify/Customer/aa20');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000aa30', '00000000-0000-0000-0000-00000000aa20', 'contado');
insert into public.pieces (id, restoration_id, description, price, arrived_at) values
  ('00000000-0000-0000-0000-00000000aa41', '00000000-0000-0000-0000-00000000aa30', 'Fuente', 100, null),
  ('00000000-0000-0000-0000-00000000aa42', '00000000-0000-0000-0000-00000000aa30', 'Bandeja', 50, now());

select is(
  (select count(*)::int from public.piece_status_history
   where piece_id = '00000000-0000-0000-0000-00000000aa41' and from_status is null and to_status = 'registrada'),
  1, 'registrar una pieza deja el paso inicial en el historial'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'aprobada') $$,
  '42501', 'Tu rol no puede hacer este cambio de estado.', 'logística no aprueba'
);
select is((select count(*)::int from public.piece_status_history), 0, 'logística no lee el historial (P42)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'entregada') $$,
  '23514', null, 'una transición inválida se rechaza'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'en_consulta', '  ') $$,
  '23514', 'Escribe una nota para este cambio de estado.', 'consultar exige nota'
);

-- Aprobar las dos: la que ya llegó pasa a Recibida (llegada anticipada).
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-00000000aa41', '00000000-0000-0000-0000-00000000aa42']::uuid[], 'aprobada')
     order by piece_id $$,
  $$ values ('aprobada'), ('recibida') $$,
  'aprobar en bloque; la pieza que ya estaba en tienda queda Recibida'
);
select results_eq(
  $$ select from_status::text, to_status::text, actor_name from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-00000000aa42' and from_status is not null order by id $$,
  $$ values ('registrada', 'aprobada', 'Vera Ventas'), ('aprobada', 'recibida', 'Vera Ventas') $$,
  'el historial guarda los dos pasos con el actor'
);
select ok(
  (select approved_at is not null and received_at is not null from public.pieces
   where id = '00000000-0000-0000-0000-00000000aa42'),
  'se fijan las fechas de aprobación y recepción'
);

reset role;
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-00000000aa30'),
  'aprobada', 'con todas las piezas aprobadas la restauración queda Aprobada'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where kind = 'order.create' and entity_id = '00000000-0000-0000-0000-00000000aa30'),
  1, 'se encola la creación de la orden de Shopify'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'recibida') $$,
  '23514', null, 'Aprobada → Recibida no es un cambio de estado: es marcar llegada'
);
select results_eq(
  $$ select status::text from public.mark_pieces_arrived(array['00000000-0000-0000-0000-00000000aa41']::uuid[]) $$,
  $$ values ('recibida') $$,
  'logística marca la llegada: Aprobada → Recibida'
);
select throws_ok(
  $$ select * from public.mark_pieces_arrived(array['00000000-0000-0000-0000-00000000aa41']::uuid[]) $$,
  '23514', null, 'no se marca dos veces la llegada'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'enviada_taller') $$,
  '23514', 'Elige el taller al que se envía la pieza.', 'enviar al taller exige taller'
);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-00000000aa41', '00000000-0000-0000-0000-00000000aa42']::uuid[],
       'enviada_taller', null, '00000000-0000-0000-0000-00000000aa10') order by piece_id $$,
  $$ values ('enviada_taller'), ('enviada_taller') $$,
  'logística envía en bloque al taller'
);

reset role;
select results_eq(
  $$ select status::text, (select location::text from public.pieces where id = '00000000-0000-0000-0000-00000000aa41'),
       (select workshop_id::text from public.pieces where id = '00000000-0000-0000-0000-00000000aa41'),
       (select first_sent_at is not null from public.pieces where id = '00000000-0000-0000-0000-00000000aa41')
     from public.restorations where id = '00000000-0000-0000-0000-00000000aa30' $$,
  $$ values ('en_proceso', 'en_taller', '00000000-0000-0000-0000-00000000aa10', true) $$,
  'en el taller: restauración En proceso, pieza En taller con su taller y primer envío'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'anulada', 'Ya no la quiere') $$,
  '42501', null, 'una pieza en el taller solo la anula el admin (P41 d)'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'devuelta_taller') $$,
  'logística recibe la pieza del taller'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'observada', 'Falta pulir el asa') $$,
  'ventas observa la pieza con nota'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select results_eq(
  $$ select last_observation from public.piece_logistics_info('00000000-0000-0000-0000-00000000aa30')
     where piece_id = '00000000-0000-0000-0000-00000000aa41' $$,
  $$ values ('Falta pulir el asa') $$,
  'logística ve la nota de la última observación'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa42']::uuid[], 'anulada', 'Pieza perdida') $$,
  'el admin anula una pieza que está en el taller'
);
reset role;
select results_eq(
  $$ select r.status::text, r.total from public.restorations r where r.id = '00000000-0000-0000-0000-00000000aa30' $$,
  $$ values ('parcialmente_lista', 100.00::numeric) $$,
  'al anular, el total baja; la observación no hace retroceder el estado alcanzado (P19)'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where kind = 'order.create' and entity_id = '00000000-0000-0000-0000-00000000aa30'),
  1, 'la orden se encola una sola vez'
);

-- Métricas con un historial conocido (fechas fijas en Lima).
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000aa31', '00000000-0000-0000-0000-00000000aa20', 'contado');
insert into public.pieces (id, restoration_id, description, price, created_at)
  values ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'Jarra', 10, '2026-10-01T15:00:00Z');
delete from public.piece_status_history where piece_id = '00000000-0000-0000-0000-00000000aa43';
insert into public.piece_status_history (piece_id, restoration_id, from_status, to_status, occurred_at) values
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'recibida', 'enviada_taller', '2026-10-02T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'enviada_taller', 'devuelta_taller', '2026-10-05T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'devuelta_taller', 'observada', '2026-10-06T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'observada', 'enviada_taller', '2026-10-07T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'enviada_taller', 'devuelta_taller', '2026-10-09T15:00:00Z');
update public.pieces set status = 'entregada', delivered_at = '2026-10-10T15:00:00Z'
  where id = '00000000-0000-0000-0000-00000000aa43';
select results_eq(
  $$ select workshop_days, workshop_ongoing, fulfillment_days, fulfillment_ongoing
     from public.piece_metrics where piece_id = '00000000-0000-0000-0000-00000000aa43' $$,
  $$ values (5, false, 9, false) $$,
  'piece_metrics suma los dos viajes al taller y los días hasta la entrega'
);
select is(
  (select count(*)::int from public.pieces p
   where p.location is distinct from public.derive_piece_location(p.status, p.arrived_at)),
  0, 'la columna generada de ubicación coincide con derive_piece_location()'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.piece_metrics), 0, 'logística no lee las métricas (P42)'
);

select is(
  public.advance_restoration_status('lista', 'en_proceso')::text, 'lista',
  'advance_restoration_status no retrocede'
);
select is(
  public.advance_restoration_status('en_proceso', 'anulada')::text, 'anulada',
  'si se anulan todas las piezas queda Anulada'
);

select * from finish();
rollback;
