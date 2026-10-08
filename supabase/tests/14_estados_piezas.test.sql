begin;

select plan(59);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000aa1', 'ventas@estados.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000aa2', 'logistica@estados.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-000000000aa3', 'admin@estados.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.workshops (id, name) values ('00000000-0000-0000-0000-00000000aa10', 'Taller Estados');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000aa20', 'persona', 'Ana', 'gid://shopify/Customer/aa20');
-- Restauraciones que salieron de una cotización de WhatsApp: sus piezas no llegaron
-- (Por WhatsApp) hasta que se marca la llegada (P48). Las de oficina nacen en la tienda.
insert into public.whatsapp_quotes (id, payment_type)
  values ('00000000-0000-0000-0000-00000000aa90', 'contado');
insert into public.restorations (id, client_id, payment_type, origin, whatsapp_quote_id)
  values ('00000000-0000-0000-0000-00000000aa30', '00000000-0000-0000-0000-00000000aa20', 'contado',
    'whatsapp', '00000000-0000-0000-0000-00000000aa90');
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

-- Aprobar las dos: la que ya llegó sigue Aprobada (ya no existe Recibida, P47).
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-00000000aa41', '00000000-0000-0000-0000-00000000aa42']::uuid[], 'aprobada')
     order by piece_id $$,
  $$ values ('aprobada'), ('aprobada') $$,
  'aprobar en bloque deja las dos piezas Aprobadas'
);
select results_eq(
  $$ select from_status::text, to_status::text, actor_name from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-00000000aa42' and from_status is not null order by id $$,
  $$ values ('registrada', 'aprobada', 'Vera Ventas') $$,
  'el historial guarda un solo paso con el actor'
);
select results_eq(
  $$ select location::text, approved_at is not null from public.pieces
     where id in ('00000000-0000-0000-0000-00000000aa41', '00000000-0000-0000-0000-00000000aa42') order by id $$,
  $$ values ('por_whatsapp', true), ('sin_enviar', true) $$,
  'la ubicación distingue Por WhatsApp de Sin enviar y se fija la aprobación'
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
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[],
       'enviada_taller', null, '00000000-0000-0000-0000-00000000aa10') $$,
  '23514', null, 'al taller solo va lo que está en la tienda (no Por WhatsApp)'
);
select results_eq(
  $$ select status::text from public.mark_pieces_arrived(array['00000000-0000-0000-0000-00000000aa41']::uuid[]) $$,
  $$ values ('aprobada') $$,
  'logística marca la llegada: la pieza sigue Aprobada'
);
reset role;
select results_eq(
  $$ select event::text, from_status::text, to_status::text from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-00000000aa41' order by id desc limit 1 $$,
  $$ values ('llegada', 'aprobada', 'aprobada') $$,
  'la llegada queda como evento en el historial'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
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
  'logística envía en bloque al taller (Interno)'
);

reset role;
select results_eq(
  $$ select r.status::text, p.location::text, p.workshop_id::text, p.first_sent_at is not null,
       p.last_sent_at is not null, p.ready_for_delivery
     from public.restorations r join public.pieces p on p.restoration_id = r.id
     where p.id = '00000000-0000-0000-0000-00000000aa41' $$,
  $$ values ('en_proceso', 'en_taller', '00000000-0000-0000-0000-00000000aa10', true, true, false) $$,
  'en el taller: restauración En proceso, pieza En taller con su taller y fechas de envío'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'anulada', 'Ya no la quiere') $$,
  '42501', null, 'una pieza en el taller solo la anula el admin (P41 d)'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'entregada') $$,
  '23514', null, 'no se entrega una pieza que sigue en el taller'
);
select throws_ok(
  $$ select * from public.receive_from_workshop(array['00000000-0000-0000-0000-00000000aa41']::uuid[]) $$,
  '42501', null, 'ventas no recibe piezas del taller'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.receive_from_workshop(array['00000000-0000-0000-0000-00000000aa41']::uuid[]) $$,
  $$ values ('enviada_taller') $$,
  'logística recibe la pieza del taller: sigue en Interno'
);
reset role;
select results_eq(
  $$ select location::text, ready_for_delivery, r.status::text
     from public.pieces p join public.restorations r on r.id = p.restoration_id
     where p.id = '00000000-0000-0000-0000-00000000aa41' $$,
  $$ values ('en_tienda', true, 'parcialmente_lista') $$,
  'de vuelta del taller: En tienda, lista para entregar, restauración Parcialmente lista'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.receive_from_workshop(array['00000000-0000-0000-0000-00000000aa41']::uuid[]) $$,
  '23514', null, 'no se recibe dos veces del taller'
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

-- Observación: la pieza queda Sin enviar hasta que se reenvía al taller (P50).
select is(
  (select location::text from public.pieces where id = '00000000-0000-0000-0000-00000000aa41'),
  'sin_enviar', 'en Observación la pieza queda Sin enviar (por reenviar al taller)'
);
select is(
  (select location from public.pieces where id = '00000000-0000-0000-0000-00000000aa41'),
  (select public.derive_piece_location(p.status, p.arrived_at, p.first_sent_at, p.last_sent_at,
     p.last_returned_at, p.returned_at) from public.pieces p where p.id = '00000000-0000-0000-0000-00000000aa41'),
  'la columna y la función coinciden para una pieza observada'
);
-- Todo el test corre en una transacción (now() fijo): la vuelta del taller se fecha antes.
update public.pieces set last_returned_at = last_returned_at - interval '1 hour'
where id = '00000000-0000-0000-0000-00000000aa41';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa41']::uuid[], 'enviada_taller') $$,
  'logística reenvía al taller la pieza observada'
);
reset role;
select is(
  (select location::text from public.pieces where id = '00000000-0000-0000-0000-00000000aa41'),
  'en_taller', 'al reenviarla vuelve a En taller'
);

-- Rechazado, No tiene arreglo y Devolver al cliente (P47).
insert into public.restorations (id, client_id, payment_type, origin, whatsapp_quote_id)
  values ('00000000-0000-0000-0000-00000000aa32', '00000000-0000-0000-0000-00000000aa20', 'contado',
    'whatsapp', '00000000-0000-0000-0000-00000000aa90');
insert into public.pieces (id, restoration_id, description, price, arrived_at, urgent) values
  ('00000000-0000-0000-0000-00000000aa44', '00000000-0000-0000-0000-00000000aa32', 'Copa', 30, now(), false),
  ('00000000-0000-0000-0000-00000000aa45', '00000000-0000-0000-0000-00000000aa32', 'Plato', 40, null, false),
  ('00000000-0000-0000-0000-00000000aa46', '00000000-0000-0000-0000-00000000aa32', 'Jarra', 70, now(), false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa44']::uuid[],
       'rechazada', 'El cliente no acepta el precio') $$,
  '23514', null, 'una pieza Registrada no se rechaza: el cliente responde en Espera (P50)'
);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa44']::uuid[], 'en_consulta', 'Cotizar el baño de plata') $$,
  'ventas consulta la Copa'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa44']::uuid[],
       'rechazada', 'El cliente no acepta el precio') $$,
  '23514', null, 'tampoco se rechaza desde Consulta'
);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa44']::uuid[], 'en_espera') $$,
  'se le envía el precio al cliente: Espera respuesta cliente'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa44']::uuid[], 'rechazada') $$,
  '23514', 'Escribe una nota para este cambio de estado.', 'rechazar exige nota'
);
select results_eq(
  $$ select status::text from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa44']::uuid[],
       'rechazada', 'El cliente no acepta el precio') $$,
  $$ values ('rechazada') $$,
  'desde Espera respuesta cliente, ventas registra el rechazo'
);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa45']::uuid[], 'en_consulta', 'Revisar soldadura') $$,
  'ventas consulta una pieza'
);
select results_eq(
  $$ select status::text from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa45']::uuid[],
       'sin_arreglo', 'La base está rota') $$,
  $$ values ('sin_arreglo') $$,
  'desde Consulta la pieza queda sin arreglo'
);
select throws_ok(
  $$ update public.pieces set description = 'Copa grande' where id = '00000000-0000-0000-0000-00000000aa44' $$,
  '23514', null, 'una pieza rechazada no se edita'
);
select lives_ok(
  $$ update public.pieces set urgent = true where id = '00000000-0000-0000-0000-00000000aa46' $$,
  'ventas marca una pieza como urgente'
);
reset role;
select results_eq(
  $$ select r.total, r.status::text, (select urgent from public.pieces where id = '00000000-0000-0000-0000-00000000aa46')
     from public.restorations r where r.id = '00000000-0000-0000-0000-00000000aa32' $$,
  $$ values (70.00::numeric, 'registrada', true) $$,
  'rechazadas y sin arreglo no se cobran: el total solo suma la Jarra'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select results_eq(
  $$ with u as (
       update public.pieces set urgent = false where id = '00000000-0000-0000-0000-00000000aa46' returning 1
     ) select count(*)::int from u $$,
  $$ values (0) $$,
  'logística no cambia la marca urgente (RLS)'
);
select throws_ok(
  $$ select * from public.return_pieces_to_client(array['00000000-0000-0000-0000-00000000aa45']::uuid[]) $$,
  '23514', null, 'no se devuelve una pieza que nunca llegó a la tienda'
);

-- La última pieza se anula: todas cerradas y alguna rechazada → Rechazada (P48).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa46']::uuid[], 'anulada', 'Registro duplicado') $$,
  'ventas anula la última pieza'
);
reset role;
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-00000000aa32'),
  'rechazada', 'todas cerradas y alguna rechazada o sin arreglo: la restauración queda Rechazada'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.restorations_operational where id = '00000000-0000-0000-0000-00000000aa32'),
  1, 'logística ve la restauración rechazada mientras tenga piezas por devolver'
);
select results_eq(
  $$ select status::text from public.return_pieces_to_client(array['00000000-0000-0000-0000-00000000aa44']::uuid[]) $$,
  $$ values ('rechazada') $$,
  'logística devuelve al cliente la pieza rechazada'
);
select is(
  (select count(*)::int from public.restorations_operational where id = '00000000-0000-0000-0000-00000000aa32'),
  0, 'sin piezas por devolver, la restauración rechazada pasa a ser pasada (D24)'
);
reset role;
select results_eq(
  $$ select location::text, returned_at is not null, returned_by::text from public.pieces
     where id = '00000000-0000-0000-0000-00000000aa44' $$,
  $$ values ('entregada', true, '00000000-0000-0000-0000-000000000aa2') $$,
  'la pieza devuelta queda con ubicación Entregada, fecha y quién la devolvió'
);

-- Si todas se anularon, la restauración queda Anulada (P48).
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000aa33', '00000000-0000-0000-0000-00000000aa20', 'contado');
insert into public.pieces (id, restoration_id, description, price)
  values ('00000000-0000-0000-0000-00000000aa47', '00000000-0000-0000-0000-00000000aa33', 'Vaso duplicado', 10);
select is(
  (select location::text from public.pieces where id = '00000000-0000-0000-0000-00000000aa47'),
  'sin_enviar', 'una pieza de oficina nace en la tienda (Sin enviar)'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000aa1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000aa47']::uuid[], 'anulada', 'Duplicada') $$,
  'ventas anula la única pieza'
);
reset role;
select results_eq(
  $$ select r.status::text, p.location::text from public.restorations r join public.pieces p on p.restoration_id = r.id
     where r.id = '00000000-0000-0000-0000-00000000aa33' $$,
  $$ values ('anulada', 'anulada') $$,
  'si todas se anularon queda Anulada, y la pieza con ubicación Anulada'
);

-- Métricas con un historial conocido (fechas fijas en Lima).
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000aa31', '00000000-0000-0000-0000-00000000aa20', 'contado');
insert into public.pieces (id, restoration_id, description, price, created_at)
  values ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'Jarra', 10, '2026-10-01T15:00:00Z');
delete from public.piece_status_history where piece_id = '00000000-0000-0000-0000-00000000aa43';
insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at) values
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'estado', 'aprobada', 'enviada_taller', '2026-10-02T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'vuelta_taller', 'enviada_taller', 'enviada_taller', '2026-10-05T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'estado', 'enviada_taller', 'observada', '2026-10-06T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'estado', 'observada', 'enviada_taller', '2026-10-07T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'vuelta_taller', 'enviada_taller', 'enviada_taller', '2026-10-09T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000aa43', '00000000-0000-0000-0000-00000000aa31', 'estado', 'enviada_taller', 'entregada', '2026-10-10T15:00:00Z');
update public.pieces set status = 'entregada', delivered_at = '2026-10-10T15:00:00Z'
  where id = '00000000-0000-0000-0000-00000000aa43';
select results_eq(
  $$ select workshop_days, workshop_ongoing, fulfillment_days, fulfillment_ongoing
     from public.piece_metrics where piece_id = '00000000-0000-0000-0000-00000000aa43' $$,
  $$ values (5, false, 9, false) $$,
  'piece_metrics suma los dos viajes al taller (hasta cada vuelta) y los días hasta la entrega'
);
select is(
  (select count(*)::int from public.pieces p
   where p.location is distinct from public.derive_piece_location(
     p.status, p.arrived_at, p.first_sent_at, p.last_sent_at, p.last_returned_at, p.returned_at)),
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
