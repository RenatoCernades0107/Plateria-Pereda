begin;

select plan(36);

-- Sin el estado "En restauración" (2026-10-17): ir al taller es una acción que cambia
-- la ubicación (send_pieces_to_workshop / receive_from_workshop), no el estado.
-- Estas pruebas no tratan pagos: se entrega como si el saldo estuviera confirmado (P45).
select set_config('app.deliver_with_balance', 'on', true);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000040a1', 'ventas@sinrest.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000040a2', 'logistica@sinrest.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000040a3', 'admin@sinrest.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.workshops (id, name) values
  ('00000000-0000-0000-0000-0000000040b1', 'Taller Uno'),
  ('00000000-0000-0000-0000-0000000040b2', 'Taller Dos');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000040c1', 'persona', 'Rita');
insert into public.whatsapp_quotes (id, payment_type)
  values ('00000000-0000-0000-0000-0000000040d9', 'contado');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000040d1', '00000000-0000-0000-0000-0000000040c1', 'contado');
insert into public.restorations (id, client_id, payment_type, origin, whatsapp_quote_id) values
  ('00000000-0000-0000-0000-0000000040d2', '00000000-0000-0000-0000-0000000040c1', 'contado',
   'whatsapp', '00000000-0000-0000-0000-0000000040d9');
-- E1: flujo completo. E2: nunca va al taller. E3: Sin arreglo. E4: anular en el taller.
-- E5: en Consulta. E6: no llegó a la tienda.
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000040e1', '00000000-0000-0000-0000-0000000040d1', 'Fuente', 100),
  ('00000000-0000-0000-0000-0000000040e2', '00000000-0000-0000-0000-0000000040d1', 'Jarra', 100),
  ('00000000-0000-0000-0000-0000000040e3', '00000000-0000-0000-0000-0000000040d1', 'Bandeja', 100),
  ('00000000-0000-0000-0000-0000000040e4', '00000000-0000-0000-0000-0000000040d1', 'Copa', 100),
  ('00000000-0000-0000-0000-0000000040e5', '00000000-0000-0000-0000-0000000040d1', 'Plato', 100);
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000040e6', '00000000-0000-0000-0000-0000000040d2', 'Cáliz', 100);

create temporary view piece as
  select p.id, p.code, p.status::text as status, p.location::text as location, p.ready_for_delivery,
    p.workshop_id, p.first_sent_at, p.last_sent_at, p.last_returned_at, p.observed_at
  from public.pieces p;
grant select on piece to authenticated;

-- El estado ya no existe.
select throws_ok(
  $$ update public.pieces set status = 'enviada_taller' where id = '00000000-0000-0000-0000-0000000040e1' $$,
  '23514', null, 'ninguna pieza puede quedar En restauración (check)'
);
select is(
  (select count(*)::int from public.piece_status_transitions
   where from_status = 'enviada_taller' or to_status = 'enviada_taller'),
  0, 'no quedan transiciones con En restauración'
);
select results_eq(
  $$ select to_status::text, roles::text, requires_note, requires_workshop
     from public.piece_status_transitions where from_status = 'aprobada' order by 1 $$,
  $$ values ('anulada', '{admin,ventas}', true, false),
            ('entregada', '{admin,ventas,logistica}', false, false),
            ('observada', '{admin,ventas,logistica}', true, false),
            ('sin_arreglo', '{admin,ventas,logistica}', true, false) $$,
  'desde Aprobada: observar, entregar, Sin arreglo y anular'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e1',
       '00000000-0000-0000-0000-0000000040e2', '00000000-0000-0000-0000-0000000040e3',
       '00000000-0000-0000-0000-0000000040e4', '00000000-0000-0000-0000-0000000040e6']::uuid[], 'aprobada') $$,
  'ventas aprueba las piezas'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e2']::uuid[], 'entregada') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e2')
    || ' aún no pasó por el taller.',
  'una Aprobada que nunca fue al taller no se entrega'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e3']::uuid[],
       'sin_arreglo', 'No tiene arreglo') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e3')
    || ' aún no pasó por el taller.',
  'una Aprobada que nunca fue al taller no queda Sin arreglo'
);
select throws_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[],
       '00000000-0000-0000-0000-0000000040b1') $$,
  '42501', 'Tu rol no puede llevar piezas al taller.', 'ventas no envía al taller'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[]) $$,
  '23514', 'Elige el taller al que se envía la pieza.', 'enviar al taller exige taller'
);
select throws_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000040e6']::uuid[],
       '00000000-0000-0000-0000-0000000040b1') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e6')
    || ' aún no llegó a la tienda.',
  'al taller solo va lo que está en la tienda'
);
select throws_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000040e5']::uuid[],
       '00000000-0000-0000-0000-0000000040b1') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e5')
    || ' no está aprobada ni observada.',
  'solo se envían piezas Aprobadas u Observadas'
);
select results_eq(
  $$ select status::text from public.send_pieces_to_workshop(
       array['00000000-0000-0000-0000-0000000040e1', '00000000-0000-0000-0000-0000000040e3',
             '00000000-0000-0000-0000-0000000040e4']::uuid[], '00000000-0000-0000-0000-0000000040b1')
     order by piece_id $$,
  $$ values ('aprobada'), ('aprobada'), ('aprobada') $$,
  'logística envía al taller: el estado no cambia'
);
select results_eq(
  $$ select location, ready_for_delivery, workshop_id, first_sent_at is not null, last_sent_at is not null
     from piece where id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('en_taller', false, '00000000-0000-0000-0000-0000000040b1'::uuid, true, true) $$,
  'enviada: En taller, con el taller y las fechas del envío'
);
select throws_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[],
       '00000000-0000-0000-0000-0000000040b1') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e1')
    || ' ya está en el taller.',
  'no se envía dos veces'
);
select throws_ok(
  $$ select public.assign_piece_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[],
       '00000000-0000-0000-0000-0000000040b2') $$,
  '23514', null, 'no se cambia el taller de una pieza que está en el taller'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e1']::uuid[], 'entregada') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e1')
    || ' sigue en el taller.',
  'no se entrega lo que sigue en el taller'
);

reset role;
select results_eq(
  $$ select event::text, from_status::text, to_status::text, workshop_id, actor_name
     from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-0000000040e1' order by id desc limit 1 $$,
  $$ values ('envio_taller', 'aprobada', 'aprobada', '00000000-0000-0000-0000-0000000040b1'::uuid,
       'Lalo Logística') $$,
  'el envío queda en el historial como evento, con el taller'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e4']::uuid[],
       'anulada', 'Ya no la quiere') $$,
  '42501', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e4')
    || ' está en el taller: solo el administrador la anula.',
  'una pieza en el taller solo la anula el admin'
);
select results_eq(
  $$ select status::text from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e3']::uuid[],
       'sin_arreglo', 'El taller dice que no tiene arreglo') $$,
  $$ values ('sin_arreglo') $$,
  'una Aprobada que ya fue al taller queda Sin arreglo'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e4']::uuid[],
       'anulada', 'Pieza perdida') $$,
  'el admin anula una pieza que está en el taller'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a2","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.receive_from_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[]) $$,
  $$ values ('aprobada') $$,
  'logística recibe del taller: sigue Aprobada'
);
select results_eq(
  $$ select p.location, p.ready_for_delivery, r.status::text
     from piece p join public.restorations_operational r on r.id = '00000000-0000-0000-0000-0000000040d1'
     where p.id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('en_tienda', true, 'parcialmente_lista') $$,
  'de vuelta: En tienda y lista para entregar; la guía queda Parcialmente lista'
);
select throws_ok(
  $$ select * from public.receive_from_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[]) $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e1')
    || ' no está en el taller.',
  'no se recibe dos veces'
);

-- Observar después de la vuelta: queda Sin enviar (por reenviar) y deja de estar lista.
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e1']::uuid[],
       'observada', 'Falta pulir') $$,
  'logística observa la pieza que volvió'
);
select results_eq(
  $$ select status, location, ready_for_delivery, observed_at is not null
     from piece where id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('observada', 'sin_enviar', false, true) $$,
  'Observada: Sin enviar, no lista, con la fecha de la observación'
);

-- Todo el test corre en una transacción (now() fijo): el envío, la vuelta y la
-- observación se fechan antes, en ese orden.
reset role;
update public.pieces set
  first_sent_at = first_sent_at - interval '3 hours',
  last_sent_at = last_sent_at - interval '3 hours',
  last_returned_at = last_returned_at - interval '2 hours',
  observed_at = observed_at - interval '1 hour'
where id = '00000000-0000-0000-0000-0000000040e1';
update public.piece_status_history
set occurred_at = occurred_at - case when event = 'estado' and to_status = 'observada'
  then interval '1 hour' else interval '4 hours' end
where piece_id = '00000000-0000-0000-0000-0000000040e1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a2","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.send_pieces_to_workshop(
       array['00000000-0000-0000-0000-0000000040e1']::uuid[], '00000000-0000-0000-0000-0000000040b2') $$,
  $$ values ('observada') $$,
  'la Observada se reenvía al taller (a otro taller)'
);
select results_eq(
  $$ select location, ready_for_delivery, workshop_id from piece where id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('en_taller', false, '00000000-0000-0000-0000-0000000040b2'::uuid) $$,
  'reenviada: En taller'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e1']::uuid[], 'entregada') $$,
  '23514', 'La pieza ' || (select code from piece where id = '00000000-0000-0000-0000-0000000040e1')
    || ' sigue en el taller.',
  'una Observada reenviada no se entrega hasta que vuelve'
);
select lives_ok(
  $$ select * from public.receive_from_workshop(array['00000000-0000-0000-0000-0000000040e1']::uuid[]) $$,
  'vuelve del reenvío'
);
select results_eq(
  $$ select location, ready_for_delivery from piece where id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('en_tienda', true) $$,
  'Observada de vuelta del reenvío: En tienda y lista'
);
select results_eq(
  $$ select status::text from public.change_piece_status(array['00000000-0000-0000-0000-0000000040e1']::uuid[], 'entregada') $$,
  $$ values ('entregada') $$,
  'se entrega'
);

-- Retroceder la entrega: vuelve a Observada con la fecha de su observación.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a3","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.undo_piece_status('00000000-0000-0000-0000-0000000040e1', 'No se la llevó') $$,
  $$ values ('observada') $$,
  'el admin retrocede la entrega'
);
select results_eq(
  $$ select location, ready_for_delivery, observed_at = (select max(h.occurred_at) from public.piece_status_history h
       where h.piece_id = '00000000-0000-0000-0000-0000000040e1' and h.event = 'estado' and h.to_status = 'observada')
     from piece where id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('en_tienda', true, true) $$,
  'vuelve a Observada lista (ya se había reenviado), con la fecha de la observación'
);
select results_eq(
  $$ select status::text from public.undo_piece_status('00000000-0000-0000-0000-0000000040e1', 'No había observación') $$,
  $$ values ('aprobada') $$,
  'retrocede la observación'
);
select results_eq(
  $$ select location, ready_for_delivery, observed_at from piece where id = '00000000-0000-0000-0000-0000000040e1' $$,
  $$ values ('en_tienda', true, null::timestamptz) $$,
  'Aprobada otra vez: sin fecha de observación, lista'
);

-- Días en taller: los viajes empiezan con el envío y terminan con la vuelta o al cerrar.
reset role;
select results_eq(
  $$ select days, ongoing from public.workshop_days(
       '[{"event": "envio_taller", "from": "aprobada", "to": "aprobada", "at": "2026-10-01T15:00:00Z"},
         {"event": "vuelta_taller", "from": "aprobada", "to": "aprobada", "at": "2026-10-04T15:00:00Z"},
         {"event": "estado", "from": "aprobada", "to": "observada", "at": "2026-10-05T15:00:00Z"},
         {"event": "envio_taller", "from": "observada", "to": "observada", "at": "2026-10-06T15:00:00Z"},
         {"event": "estado", "from": "observada", "to": "anulada", "at": "2026-10-08T15:00:00Z"}]'::jsonb,
       '2026-10-10T15:00:00Z') $$,
  $$ values (5, false) $$,
  'días en taller: un viaje hasta la vuelta y otro hasta la anulación'
);
select is(
  (select count(*)::int from public.pieces p
   where p.location is distinct from public.derive_piece_location(
     p.status, p.arrived_at, p.first_sent_at, p.last_sent_at, p.last_returned_at, p.returned_at,
     p.review_sent_at, p.review_returned_at, p.observed_at)),
  0, 'la columna generada de ubicación coincide con derive_piece_location()'
);

select * from finish();
rollback;
