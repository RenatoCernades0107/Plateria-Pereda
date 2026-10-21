begin;

select plan(43);

-- "Deshacer" tras mover una pieza en el kanban (2026-10-21): la pieza vuelve EXACTAMENTE
-- a como estaba (estado, fechas, taller) y el evento del historial se borra. Solo quien
-- la movió, dentro de 2 minutos, si nada pasó después y sin tocar Shopify ni pagos.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000048a1', 'ventas@deshacer.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000048a2', 'logistica@deshacer.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000048a3', 'admin@deshacer.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000048a4', 'otro@deshacer.test', '{"role":"admin"}', '{"full_name":"Otro Admin"}');

insert into public.workshops (id, name) values ('00000000-0000-0000-0000-0000000048b1', 'Taller Deshacer');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000048c1', 'persona', 'Rita');
-- Oficina: las piezas nacen en la tienda. A: aprobar y taller. B: revisión. C: otros casos.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000048d1', '00000000-0000-0000-0000-0000000048c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, service_cost) values
  ('00000000-0000-0000-0000-0000000048e1', '00000000-0000-0000-0000-0000000048d1', 'Fuente', 100, 40),
  ('00000000-0000-0000-0000-0000000048e2', '00000000-0000-0000-0000-0000000048d1', 'Jarra', 100, 40),
  ('00000000-0000-0000-0000-0000000048e3', '00000000-0000-0000-0000-0000000048d1', 'Copa', 100, 40);

-- Movimientos que se deshacen (los ids que la interfaz recibe tras mover) y fotos.
create temp table movimientos (nombre text primary key, ids bigint[]);
create temp table antes as
  select p.id, p.status, p.location, p.workshop_id, r.status as restoration_status
  from public.pieces p join public.restorations r on r.id = p.restoration_id
  where false;
grant all on movimientos, antes to authenticated;

set local role authenticated;

-- 1. Cambio de estado: Registrada → Aprobada (no es la última: no crea la orden).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a1","role":"authenticated"}', true);
insert into antes select p.id, p.status, p.location, p.workshop_id,
    (select r.status from public.restorations r where r.id = p.restoration_id)
  from public.pieces p where p.id = '00000000-0000-0000-0000-0000000048e1';
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000048e1']::uuid[], 'aprobada') $$,
  'ventas aprueba la pieza A'
);
insert into movimientos values ('aprobar',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e1']::uuid[]));
select is((select cardinality(ids) from movimientos where nombre = 'aprobar'), 1,
  'tras mover, la interfaz recibe el evento que se puede deshacer');

-- Otro usuario no lo deshace (ni se le ofrece).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a4","role":"authenticated"}', true);
select is(public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e1']::uuid[]), '{}'::bigint[],
  'a otro usuario no se le ofrece deshacer');
select throws_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'aprobar')),
  '42501', 'Solo quien movió la pieza puede deshacer el movimiento.',
  'otro usuario no deshace el movimiento'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a1","role":"authenticated"}', true);
select results_eq(
  format('select status::text from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'aprobar')),
  $$ values ('registrada') $$,
  'deshacer la aprobación devuelve la pieza a Registrada'
);
select is(
  (select approved_at from public.pieces where id = '00000000-0000-0000-0000-0000000048e1'),
  null::timestamptz, 'la fecha de aprobación vuelve a estar vacía'
);
select is(
  (select count(*)::int from public.piece_status_history where piece_id = '00000000-0000-0000-0000-0000000048e1'),
  1, 'el evento del movimiento se borra: solo queda el registro'
);
select is(
  (select r.status::text from public.restorations r where r.id = '00000000-0000-0000-0000-0000000048d1'),
  (select restoration_status::text from antes where id = '00000000-0000-0000-0000-0000000048e1'),
  'la guía vuelve a su estado anterior'
);
select throws_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'aprobar')),
  '23514', 'Este movimiento ya no se puede deshacer.', 'un movimiento se deshace una sola vez'
);

-- 2. "Enviar al taller" y deshacer: NO queda Lista para entregar (no es "Recibir").
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000048e1']::uuid[], 'aprobada') $$,
  'el admin vuelve a aprobar la pieza A'
);
delete from antes;
insert into antes select p.id, p.status, p.location, p.workshop_id,
    (select r.status from public.restorations r where r.id = p.restoration_id)
  from public.pieces p where p.id = '00000000-0000-0000-0000-0000000048e1';
select lives_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000048e1']::uuid[],
       '00000000-0000-0000-0000-0000000048b1') $$,
  'el admin envía la pieza A al taller'
);
insert into movimientos values ('enviar',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e1']::uuid[]));
select results_eq(
  format('select status::text from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'enviar')),
  $$ values ('aprobada') $$,
  'se deshace el envío al taller'
);
select results_eq(
  $$ select location::text, ready_for_delivery, first_sent_at, last_sent_at, workshop_id
     from public.pieces where id = '00000000-0000-0000-0000-0000000048e1' $$,
  $$ values ('sin_enviar', false, null::timestamptz, null::timestamptz, null::uuid) $$,
  'la pieza vuelve a «por enviar», sin fechas de taller ni taller, y NO queda lista para entregar'
);
select is(
  (select location::text from public.pieces where id = '00000000-0000-0000-0000-0000000048e1'),
  (select location::text from antes where id = '00000000-0000-0000-0000-0000000048e1'),
  'misma ubicación que antes del envío'
);
select is(
  (select count(*)::int from public.piece_status_history
   where piece_id = '00000000-0000-0000-0000-0000000048e1' and event = 'envio_taller'),
  0, 'no queda un envío fantasma en el historial'
);
select is(
  (select r.status::text from public.restorations r where r.id = '00000000-0000-0000-0000-0000000048d1'),
  (select restoration_status::text from antes where id = '00000000-0000-0000-0000-0000000048e1'),
  'la guía vuelve a su estado anterior al envío'
);
select ok(
  exists (
    select 1 from public.audit_log l
    where l.table_name = 'pieces' and l.record_id = '00000000-0000-0000-0000-0000000048e1'
      and l.action = 'update'
      and l.changes -> 'last_sent_at' ->> 'old' is not null
      and l.changes -> 'last_sent_at' ->> 'new' is null
  ),
  'la auditoría registra la reposición de la pieza'
);

-- 3. "Recibir del taller" y deshacer: vuelve a estar en el taller.
select lives_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000048e1']::uuid[],
       '00000000-0000-0000-0000-0000000048b1') $$,
  'se envía otra vez la pieza A al taller'
);
select lives_ok(
  $$ select * from public.receive_from_workshop(array['00000000-0000-0000-0000-0000000048e1']::uuid[]) $$,
  'se recibe la pieza A del taller'
);
select is(
  (select ready_for_delivery from public.pieces where id = '00000000-0000-0000-0000-0000000048e1'),
  true, 'al recibirla queda lista para entregar'
);
insert into movimientos values ('recibir',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e1']::uuid[]));
select lives_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'recibir')),
  'se deshace la recepción'
);
select results_eq(
  $$ select location::text, ready_for_delivery, last_returned_at, workshop_id
     from public.pieces where id = '00000000-0000-0000-0000-0000000048e1' $$,
  $$ values ('en_taller', false, null::timestamptz, '00000000-0000-0000-0000-0000000048b1'::uuid) $$,
  'la pieza vuelve a estar en el taller, sin fecha de vuelta'
);
select results_eq(
  $$ select event::text from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-0000000048e1' order by occurred_at, id $$,
  $$ values ('estado'), ('estado'), ('envio_taller') $$,
  'el historial queda: registro, aprobación y el envío en curso'
);

-- 4. Revisión en taller: ida y vuelta.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000048e2']::uuid[],
       'en_consulta', 'Revisar con el taller') $$,
  'ventas pone la pieza B en Consulta'
);
delete from antes;
insert into antes select p.id, p.status, p.location, p.workshop_id,
    (select r.status from public.restorations r where r.id = p.restoration_id)
  from public.pieces p where p.id = '00000000-0000-0000-0000-0000000048e2';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000048e2']::uuid[],
       '00000000-0000-0000-0000-0000000048b1') $$,
  'logística lleva la pieza B a revisar'
);
insert into movimientos values ('revision',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e2']::uuid[]));
select lives_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'revision')),
  'logística deshace la ida a revisión'
);
-- Logística no lee las piezas directamente: se comprueba como admin.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a3","role":"authenticated"}', true);
select results_eq(
  $$ select p.location::text, p.review_sent_at, p.workshop_id from public.pieces p
     where p.id = '00000000-0000-0000-0000-0000000048e2' $$,
  $$ select a.location::text, null::timestamptz, a.workshop_id from antes a
     where a.id = '00000000-0000-0000-0000-0000000048e2' $$,
  'la pieza B vuelve a la tienda, sin revisión ni taller'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000048e2']::uuid[],
       '00000000-0000-0000-0000-0000000048b1') $$,
  'logística vuelve a llevar la pieza B a revisar'
);
select lives_ok(
  $$ select * from public.receive_pieces_from_review(array['00000000-0000-0000-0000-0000000048e2']::uuid[]) $$,
  'la pieza B vuelve de revisión'
);
insert into movimientos values ('vuelta_revision',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e2']::uuid[]));
select lives_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'vuelta_revision')),
  'logística deshace la vuelta de revisión'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a3","role":"authenticated"}', true);
select results_eq(
  $$ select location::text, review_returned_at, workshop_id from public.pieces
     where id = '00000000-0000-0000-0000-0000000048e2' $$,
  $$ values ('en_taller', null::timestamptz, '00000000-0000-0000-0000-0000000048b1'::uuid) $$,
  'la pieza B vuelve a estar en el taller por revisión'
);

-- 5. Plazo vencido.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.receive_pieces_from_review(array['00000000-0000-0000-0000-0000000048e2']::uuid[]) $$,
  'la pieza B vuelve de revisión otra vez'
);
insert into movimientos values ('vencido',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e2']::uuid[]));
reset role;
update public.piece_status_history set occurred_at = now() - interval '3 minutes'
where id = (select ids[1] from movimientos where nombre = 'vencido');
set local role authenticated;
select is(public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e2']::uuid[]), '{}'::bigint[],
  'pasado el plazo ya no se ofrece deshacer');
select throws_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'vencido')),
  '23514', null, 'pasados 2 minutos no se deshace'
);

-- 6. Ya no es el último evento de la pieza.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000048e3']::uuid[],
       'en_consulta', 'Consultar') $$,
  'ventas pone la pieza C en Consulta'
);
insert into movimientos values ('consulta',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e3']::uuid[]));
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000048e3']::uuid[], 'en_espera') $$,
  'ventas pasa la pieza C a esperar al cliente'
);
select throws_ok(
  format('select * from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'consulta')),
  '23514', 'La pieza ' || (select code from public.pieces where id = '00000000-0000-0000-0000-0000000048e3')
    || ' cambió después del movimiento; ya no se puede deshacer.',
  'no se deshace un movimiento que ya no es el último de la pieza'
);
insert into movimientos values ('espera',
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e3']::uuid[]));
select results_eq(
  format('select status::text from public.undo_piece_move(%L)', (select ids from movimientos where nombre = 'espera')),
  $$ values ('en_consulta') $$,
  'el último movimiento sí se deshace'
);
select is(public.piece_previous_status('00000000-0000-0000-0000-0000000048e3'), 'registrada'::public.piece_status,
  '"Retroceder estado" no ve pasos fantasma: el anterior vuelve a ser Registrada');

-- 7. La aprobación que crea la orden de Shopify no se deshace (se usa "Retroceder").
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000048a3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000048e2', '00000000-0000-0000-0000-0000000048e3']::uuid[], 'en_espera') $$,
  'el admin pasa las piezas B y C a esperar al cliente'
);
select lives_ok(
  $$ select * from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000048e2', '00000000-0000-0000-0000-0000000048e3']::uuid[], 'aprobada') $$,
  'el admin aprueba las últimas piezas (se encola la orden)'
);
select is(
  public.piece_move_undo_ids(array['00000000-0000-0000-0000-0000000048e2', '00000000-0000-0000-0000-0000000048e3']::uuid[]),
  '{}'::bigint[], 'una aprobación que encola la orden no ofrece deshacer'
);
select throws_ok(
  format('select * from public.undo_piece_move(%L)', (
    select array_agg(h.id) from public.piece_status_history h
    where h.piece_id = '00000000-0000-0000-0000-0000000048e3' and h.to_status = 'aprobada'
  )),
  '23514', null, 'ni se puede deshacer llamando a la BD'
);

select * from finish();
rollback;
