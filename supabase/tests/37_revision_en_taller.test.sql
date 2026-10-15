begin;

select plan(33);

-- Revisión en taller (2026-10-15): una pieza en Consulta o esperando la respuesta del
-- cliente va al taller a revisar sin cambiar de estado; vuelve con "Volvió de revisión"
-- o, si el cliente aprueba, pasa a En restauración en el mismo taller.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000037a1', 'ventas@revision.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000037a2', 'logistica@revision.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000037a3', 'admin@revision.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.workshops (id, name) values
  ('00000000-0000-0000-0000-0000000037b1', 'Taller Revisión'),
  ('00000000-0000-0000-0000-0000000037b2', 'Otro Taller');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000037c1', 'persona', 'Rita');
insert into public.whatsapp_quotes (id, payment_type)
  values ('00000000-0000-0000-0000-0000000037d9', 'contado');
-- Oficina: las piezas nacen en la tienda. WhatsApp: la pieza aún no llega.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000037d1', '00000000-0000-0000-0000-0000000037c1', 'contado');
insert into public.restorations (id, client_id, payment_type, origin, whatsapp_quote_id) values
  ('00000000-0000-0000-0000-0000000037d2', '00000000-0000-0000-0000-0000000037c1', 'contado',
   'whatsapp', '00000000-0000-0000-0000-0000000037d9');
-- A: el flujo completo. B: no llegó. C: sigue Registrada. E: días de una revisión
-- cerrada. F: aprobada en el taller pasa a En restauración. G: otro taller.
insert into public.pieces (id, restoration_id, description, price, service_cost) values
  ('00000000-0000-0000-0000-0000000037e1', '00000000-0000-0000-0000-0000000037d1', 'Fuente', 100, 40),
  ('00000000-0000-0000-0000-0000000037e3', '00000000-0000-0000-0000-0000000037d1', 'Jarra', 100, 40),
  ('00000000-0000-0000-0000-0000000037e5', '00000000-0000-0000-0000-0000000037d1', 'Bandeja', 100, 40),
  ('00000000-0000-0000-0000-0000000037e6', '00000000-0000-0000-0000-0000000037d1', 'Copa', 100, 40),
  ('00000000-0000-0000-0000-0000000037e7', '00000000-0000-0000-0000-0000000037d1', 'Plato', 100, 40);
insert into public.pieces (id, restoration_id, description, price, service_cost) values
  ('00000000-0000-0000-0000-0000000037e2', '00000000-0000-0000-0000-0000000037d2', 'Cáliz', 100, 40);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a1","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::int from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000037e1', '00000000-0000-0000-0000-0000000037e2',
             '00000000-0000-0000-0000-0000000037e5', '00000000-0000-0000-0000-0000000037e6',
             '00000000-0000-0000-0000-0000000037e7']::uuid[], 'en_consulta', 'Revisar con el taller') $$,
  $$ values (5) $$,
  'ventas pone las piezas en Consulta'
);
select throws_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000037e1']::uuid[],
       '00000000-0000-0000-0000-0000000037b1') $$,
  '42501', 'Tu rol no puede llevar piezas al taller.', 'ventas no lleva piezas al taller'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000037e2']::uuid[],
       '00000000-0000-0000-0000-0000000037b1') $$,
  '23514', null, 'no se lleva a revisar una pieza que no llegó a la tienda'
);
select throws_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000037e3']::uuid[],
       '00000000-0000-0000-0000-0000000037b1') $$,
  '23514', null, 'solo se lleva a revisar una pieza en Consulta o esperando respuesta'
);
select throws_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000037e1']::uuid[], null) $$,
  '23514', 'Elige el taller al que se lleva la pieza.', 'llevar a revisar exige taller'
);
select results_eq(
  $$ select status::text from public.send_pieces_for_review(
       array['00000000-0000-0000-0000-0000000037e1']::uuid[], '00000000-0000-0000-0000-0000000037b1') $$,
  $$ values ('en_consulta') $$,
  'logística lleva la pieza a revisar: sigue en Consulta'
);
select results_eq(
  $$ select status::text, location::text, workshop_id from public.pieces_operational
     where id = '00000000-0000-0000-0000-0000000037e1' $$,
  $$ values ('en_consulta', 'en_taller', '00000000-0000-0000-0000-0000000037b1'::uuid) $$,
  'en revisión la pieza está En taller, con el taller elegido'
);
select throws_ok(
  $$ select * from public.send_pieces_for_review(array['00000000-0000-0000-0000-0000000037e1']::uuid[],
       '00000000-0000-0000-0000-0000000037b1') $$,
  '23514', 'La pieza ' || (select code from public.pieces_operational where id = '00000000-0000-0000-0000-0000000037e1')
    || ' ya está en el taller por revisión.',
  'no se lleva dos veces a revisar'
);
select throws_ok(
  $$ select public.assign_piece_workshop(array['00000000-0000-0000-0000-0000000037e1']::uuid[],
       '00000000-0000-0000-0000-0000000037b2') $$,
  '23514', null, 'no se cambia el taller de una pieza en revisión'
);

reset role;
select results_eq(
  $$ select event::text, from_status::text, to_status::text, workshop_id, actor_name
     from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-0000000037e1' order by id desc limit 1 $$,
  $$ values ('envio_revision', 'en_consulta', 'en_consulta', '00000000-0000-0000-0000-0000000037b1'::uuid,
       'Lalo Logística') $$,
  'el envío a revisión queda en el historial con el taller'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a3","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000037e1']::uuid[],
       'sin_arreglo', 'No tiene arreglo') $$,
  '23514', 'La pieza ' || (select code from public.pieces_operational where id = '00000000-0000-0000-0000-0000000037e1')
    || ' está en el taller por revisión; marca primero que volvió.',
  'en revisión no se marca No tiene arreglo'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000037e1']::uuid[],
       'anulada', 'Ya no va') $$,
  '23514', null, 'en revisión no se anula'
);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000037e1']::uuid[], 'en_espera') $$,
  $$ values ('en_espera') $$,
  'en revisión sí pasa a Espera respuesta cliente'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000037e1'),
  'en_taller', 'esperando respuesta sigue En taller'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000037e1']::uuid[],
       'rechazada', 'No acepta') $$,
  '23514', null, 'en revisión el cliente no rechaza hasta que vuelve'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.receive_pieces_from_review(array['00000000-0000-0000-0000-0000000037e1']::uuid[]) $$,
  '42501', 'Tu rol no puede recibir piezas del taller.', 'ventas no recibe la pieza de la revisión'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a2","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.receive_pieces_from_review(
       array['00000000-0000-0000-0000-0000000037e1']::uuid[]) $$,
  $$ values ('en_espera') $$,
  'logística marca que volvió de revisión: el estado no cambia'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000037e1'),
  'en_tienda', 'de vuelta de la revisión la pieza está En tienda'
);
select throws_ok(
  $$ select * from public.receive_pieces_from_review(array['00000000-0000-0000-0000-0000000037e1']::uuid[]) $$,
  '23514', null, 'no se recibe una pieza que no está en revisión'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a1","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000037e1']::uuid[], 'rechazada', 'No acepta') $$,
  $$ values ('rechazada') $$,
  'de vuelta de la revisión ya se puede cerrar'
);

reset role;
select results_eq(
  $$ select event::text from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-0000000037e1' and event <> 'estado' order by id $$,
  $$ values ('envio_revision'), ('vuelta_revision') $$,
  'el historial guarda la ida y la vuelta de la revisión'
);

-- F: en revisión el cliente aprueba y pasa a En restauración en el mismo taller.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a2","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.send_pieces_for_review(
       array['00000000-0000-0000-0000-0000000037e6', '00000000-0000-0000-0000-0000000037e7']::uuid[],
       '00000000-0000-0000-0000-0000000037b1') order by piece_id $$,
  $$ values ('en_consulta'), ('en_consulta') $$,
  'logística lleva varias piezas a revisar'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a1","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000037e6', '00000000-0000-0000-0000-0000000037e7']::uuid[], 'en_espera')
     order by piece_id $$,
  $$ values ('en_espera'), ('en_espera') $$,
  'en revisión esperan la respuesta del cliente'
);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000037e6', '00000000-0000-0000-0000-0000000037e7']::uuid[], 'aprobada')
     order by piece_id $$,
  $$ values ('aprobada'), ('aprobada') $$,
  'el cliente aprueba mientras están en el taller'
);
select is(
  (select location::text from public.pieces_operational where id = '00000000-0000-0000-0000-0000000037e6'),
  'en_taller', 'aprobada en revisión sigue En taller'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000037e7']::uuid[],
       'enviada_taller', null, '00000000-0000-0000-0000-0000000037b2') $$,
  '23514', null, 'desde la revisión no pasa a En restauración en otro taller'
);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000037e6']::uuid[], 'enviada_taller') $$,
  $$ values ('enviada_taller') $$,
  'desde la revisión pasa a En restauración sin traerla de vuelta'
);
select results_eq(
  $$ select location::text, workshop_id, review_returned_at >= review_sent_at from public.pieces_operational
     where id = '00000000-0000-0000-0000-0000000037e6' $$,
  $$ values ('en_taller', '00000000-0000-0000-0000-0000000037b1'::uuid, true) $$,
  'sigue En taller, en el mismo taller, y la revisión queda cerrada'
);

-- Días en taller: la revisión cuenta. Todo el test corre en una transacción (now()
-- fijo): las fechas del historial se mueven hacia atrás.
reset role;
update public.piece_status_history
set occurred_at = occurred_at - case when event = 'envio_revision' then interval '5 days' else interval '6 days' end
where piece_id = '00000000-0000-0000-0000-0000000037e6'
  and (event = 'envio_revision' or to_status in ('registrada', 'en_consulta'));
select results_eq(
  $$ select days, ongoing from public.workshop_days(
       private.piece_history_json('00000000-0000-0000-0000-0000000037e6'), now()) $$,
  $$ values (5, true) $$,
  'aprobada y enviada desde la revisión: un solo viaje desde el envío a revisión'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a2","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.send_pieces_for_review(
       array['00000000-0000-0000-0000-0000000037e5']::uuid[], '00000000-0000-0000-0000-0000000037b1') $$,
  $$ values ('en_consulta') $$,
  'otra pieza va a revisión'
);
reset role;
update public.piece_status_history
set occurred_at = occurred_at - case when event = 'envio_revision' then interval '3 days' else interval '4 days' end
where piece_id = '00000000-0000-0000-0000-0000000037e5'
  and (event = 'envio_revision' or to_status in ('registrada', 'en_consulta'));
select results_eq(
  $$ select days, ongoing from public.workshop_days(
       private.piece_history_json('00000000-0000-0000-0000-0000000037e5'), now()) $$,
  $$ values (3, true) $$,
  'los días de una revisión abierta cuentan como días en taller (en curso)'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000037a3","role":"authenticated"}', true);
select results_eq(
  $$ select workshop_days, workshop_ongoing from public.list_pieces_board(p_restoration_code => null)
     where id = '00000000-0000-0000-0000-0000000037e5' $$,
  $$ values (3, true) $$,
  'la vista de piezas cuenta los días de la revisión (alerta de días en taller)'
);

reset role;
select is(
  (select count(*)::int from public.pieces p
   where p.location is distinct from public.derive_piece_location(
     p.status, p.arrived_at, p.first_sent_at, p.last_sent_at, p.last_returned_at, p.returned_at,
     p.review_sent_at, p.review_returned_at)),
  0, 'la columna generada de ubicación coincide con derive_piece_location()'
);

select * from finish();
rollback;
