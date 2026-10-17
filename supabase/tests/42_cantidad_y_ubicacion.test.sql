begin;

select plan(24);

-- Cantidad por pieza, días en la ubicación, filtros "Sin taller" y "Listas" (con las por
-- devolver) y el historial de guías que aún tienen piezas por devolver (2026-10-17).
select set_config('app.deliver_with_balance', 'on', true);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000042a1', 'ventas@cantidad.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000042a2', 'logistica@cantidad.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000042a3', 'admin@cantidad.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000042c1', 'persona', 'Cantidades', 'gid://shopify/Customer/42c1');
insert into public.workshops (id, name) values ('00000000-0000-0000-0000-0000000042b1', 'Taller Cantidad');

create temporary table created (label text primary key, id uuid);
grant all on created to authenticated;

-- 1. Cantidad.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000042d1', '00000000-0000-0000-0000-0000000042c1', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000042e1', '00000000-0000-0000-0000-0000000042d1', 'Cucharitas cantidad', 100);
select is(
  (select quantity from public.pieces where id = '00000000-0000-0000-0000-0000000042e1'),
  1, 'la cantidad es 1 por omisión'
);
select throws_ok(
  $$ update public.pieces set quantity = 0 where id = '00000000-0000-0000-0000-0000000042e1' $$,
  '23514', null, 'la cantidad va de 1 a 999'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a1","role":"authenticated"}', true);
insert into created
select 'oficina', id from public.create_restoration(
  '00000000-0000-0000-0000-0000000042c1', null, 'contado', null, '',
  '[{"description": "Tenedores cantidad", "quantity": 6}, {"description": "Cuchillo cantidad", "quantity": ""}]');
select results_eq(
  $$ select p.quantity from public.pieces p join created c on c.id = p.restoration_id
     where c.label = 'oficina' order by p.number $$,
  $$ values (6), (1) $$,
  'create_restoration guarda la cantidad de cada pieza (vacía: 1)'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-0000000042c1', null, 'contado', null, '',
       '[{"description": "Mal", "quantity": 1.5}]') $$,
  '22023', 'La cantidad debe ser un número entero entre 1 y 999.', 'una cantidad no entera se rechaza'
);
select lives_ok(
  $$ update public.pieces set quantity = 12
     where restoration_id = (select id from created where label = 'oficina') and quantity = 6 $$,
  'ventas edita la cantidad'
);

-- Cotización de WhatsApp: la cantidad se cotiza y pasa a la pieza.
insert into created
select 'cotizacion', id from public.create_whatsapp_quote(
  '00000000-0000-0000-0000-0000000042c1', null, null, null, 'contado', null, '',
  '[{"description": "Copas cotizadas", "price": 90, "quantity": 4}]');
select is(
  (select i.quantity from public.whatsapp_quote_items i join created c on c.id = i.quote_id
   where c.label = 'cotizacion'),
  4, 'la pieza cotizada guarda su cantidad'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a3","role":"authenticated"}', true);
insert into created
select 'desde_cotizacion', r.id from public.create_restoration_from_whatsapp_quote(
  (select id from created where label = 'cotizacion'), '00000000-0000-0000-0000-0000000042c1', null,
  'contado', null, '',
  (select jsonb_agg(jsonb_build_object('quote_item_id', i.id, 'description', i.description,
     'price', i.price, 'status', 'aprobada'))
   from public.whatsapp_quote_items i where i.quote_id = (select id from created where label = 'cotizacion'))
) r;
select is(
  (select p.quantity from public.pieces p join created c on c.id = p.restoration_id
   where c.label = 'desde_cotizacion'),
  4, 'la restauración desde la cotización copia la cantidad'
);
select results_eq(
  $$ select quantity from public.list_pieces_board(p_query => 'Copas cotizadas') $$,
  $$ values (4) $$,
  'la vista de piezas trae la cantidad'
);

-- 2. Días en la ubicación.
select results_eq(
  $$ select
       public.piece_location_since('por_whatsapp', 'aprobada', '2026-10-01T15:00:00Z'),
       public.piece_location_since('sin_enviar', 'aprobada', '2026-10-01T15:00:00Z', '2026-10-02T15:00:00Z'),
       public.piece_location_since('sin_enviar', 'en_consulta', '2026-10-01T15:00:00Z', '2026-10-02T15:00:00Z',
         p_review_sent_at => '2026-10-03T15:00:00Z', p_review_returned_at => '2026-10-04T15:00:00Z'),
       public.piece_location_since('sin_enviar', 'observada', '2026-10-01T15:00:00Z', '2026-10-02T15:00:00Z',
         p_observed_at => '2026-10-08T15:00:00Z', p_last_sent_at => '2026-10-03T15:00:00Z',
         p_last_returned_at => '2026-10-05T15:00:00Z') $$,
  $$ values ('2026-10-01T15:00:00Z'::timestamptz, '2026-10-02T15:00:00Z'::timestamptz,
       '2026-10-04T15:00:00Z'::timestamptz, '2026-10-08T15:00:00Z'::timestamptz) $$,
  'desde: registro (Por WhatsApp), llegada o vuelta de revisión (Sin enviar), observación (Observada)'
);
select results_eq(
  $$ select
       public.piece_location_since('en_taller', 'aprobada', '2026-10-01T15:00:00Z', '2026-10-02T15:00:00Z',
         p_last_sent_at => '2026-10-03T15:00:00Z'),
       public.piece_location_since('en_taller', 'en_espera', '2026-10-01T15:00:00Z', '2026-10-02T15:00:00Z',
         p_review_sent_at => '2026-10-04T15:00:00Z'),
       public.piece_location_since('en_tienda', 'aprobada', '2026-10-01T15:00:00Z', '2026-10-02T15:00:00Z',
         p_last_sent_at => '2026-10-03T15:00:00Z', p_last_returned_at => '2026-10-06T15:00:00Z'),
       public.piece_location_since('entregada', 'entregada', '2026-10-01T15:00:00Z',
         p_delivered_at => '2026-10-09T15:00:00Z'),
       public.piece_location_since('entregada', 'rechazada', '2026-10-01T15:00:00Z',
         p_returned_at => '2026-10-10T15:00:00Z'),
       public.piece_location_since('anulada', 'anulada', '2026-10-01T15:00:00Z',
         p_cancelled_at => '2026-10-11T15:00:00Z') $$,
  $$ values ('2026-10-03T15:00:00Z'::timestamptz, '2026-10-04T15:00:00Z'::timestamptz,
       '2026-10-06T15:00:00Z'::timestamptz, '2026-10-09T15:00:00Z'::timestamptz,
       '2026-10-10T15:00:00Z'::timestamptz, '2026-10-11T15:00:00Z'::timestamptz) $$,
  'desde: envío (En taller), vuelta (En tienda), entrega o devolución, anulación'
);

reset role;
update public.pieces set status = 'aprobada', approved_at = now() - interval '6 days',
  arrived_at = now() - interval '7 days', workshop_id = '00000000-0000-0000-0000-0000000042b1',
  first_sent_at = now() - interval '5 days', last_sent_at = now() - interval '5 days',
  last_returned_at = now() - interval '2 days'
where id = '00000000-0000-0000-0000-0000000042e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a2","role":"authenticated"}', true);
select results_eq(
  $$ select location::text, location_since, ready_for_delivery from public.list_pieces_board(p_query => 'Cucharitas cantidad') $$,
  $$ values ('en_tienda', now() - interval '2 days', true) $$,
  'la vista de piezas trae desde cuándo está en su ubicación'
);

-- 3. Filtros: sin taller y listas (para entregar o devolver).
reset role;
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000042d2', '00000000-0000-0000-0000-0000000042c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, status) values
  ('00000000-0000-0000-0000-0000000042e2', '00000000-0000-0000-0000-0000000042d2', 'Vaso por devolver cantidad', 10, 'rechazada'),
  ('00000000-0000-0000-0000-0000000042e3', '00000000-0000-0000-0000-0000000042d2', 'Plato aprobado cantidad', 10, 'aprobada');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a3","role":"authenticated"}', true);
select results_eq(
  $$ select description, to_return from public.list_pieces_board(p_query => 'cantidad', p_ready => true)
     order by description $$,
  $$ values ('Cucharitas cantidad', false), ('Vaso por devolver cantidad', true) $$,
  'Listas: las listas para entregar y las por devolver'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'cantidad', p_to_return => true) $$,
  $$ values ('Vaso por devolver cantidad') $$,
  'p_to_return sigue filtrando solo las por devolver'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'cantidad', p_no_workshop => true)
   where workshop_id is not null),
  0, 'Sin taller: solo piezas sin taller asignado'
);
select ok(
  (select count(*)::int from public.list_pieces_board(p_query => 'cantidad', p_no_workshop => true)) > 0
  and not exists (select 1 from public.list_pieces_board(p_query => 'cantidad', p_no_workshop => true)
    where description = 'Cucharitas cantidad'),
  'Sin taller excluye la pieza que tiene taller'
);

-- 4. Historial de guías: la rechazada con una pieza por devolver sigue activa.
reset role;
update public.pieces set status = 'anulada' where id = '00000000-0000-0000-0000-0000000042e3';
update public.restorations set status = 'rechazada' where id = '00000000-0000-0000-0000-0000000042d2';
-- Completada antes de hoy, con una pieza sin arreglo aún en la tienda.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000042d3', '00000000-0000-0000-0000-0000000042c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, status, delivered_at, first_sent_at) values
  ('00000000-0000-0000-0000-0000000042e4', '00000000-0000-0000-0000-0000000042d3', 'Fuente entregada', 10, 'entregada',
   now() - interval '3 days', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000042e5', '00000000-0000-0000-0000-0000000042d3', 'Tapa sin arreglo', 10, 'sin_arreglo',
   null, now() - interval '5 days');
update public.restorations set status = 'completada' where id = '00000000-0000-0000-0000-0000000042d3';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a1","role":"authenticated"}', true);
select results_eq(
  $$ select count(*) filter (where id = '00000000-0000-0000-0000-0000000042d2')::int,
       count(*) filter (where id = '00000000-0000-0000-0000-0000000042d3')::int
     from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000042c1', p_scope => 'historial') $$,
  $$ values (0, 0) $$,
  'una guía rechazada o completada con piezas por devolver no pasa al historial'
);
select results_eq(
  $$ select count(*) filter (where id = '00000000-0000-0000-0000-0000000042d2')::int,
       count(*) filter (where id = '00000000-0000-0000-0000-0000000042d3')::int
     from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000042c1', p_scope => 'activas') $$,
  $$ values (1, 1) $$,
  'sigue en la lista de activas'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.restorations_operational
   where id in ('00000000-0000-0000-0000-0000000042d2', '00000000-0000-0000-0000-0000000042d3')),
  2, 'logística las sigue viendo para devolver las piezas'
);
select lives_ok(
  $$ select * from public.return_pieces_to_client(array['00000000-0000-0000-0000-0000000042e2',
       '00000000-0000-0000-0000-0000000042e5']::uuid[]) $$,
  'logística devuelve las piezas al cliente'
);
select is(
  (select count(*)::int from public.restorations_operational
   where id in ('00000000-0000-0000-0000-0000000042d2', '00000000-0000-0000-0000-0000000042d3')),
  0, 'devueltas, las guías pasan a ser pasadas para logística'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a1","role":"authenticated"}', true);
select results_eq(
  $$ select count(*) filter (where id = '00000000-0000-0000-0000-0000000042d2')::int,
       count(*) filter (where id = '00000000-0000-0000-0000-0000000042d3')::int
     from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000042c1', p_scope => 'historial') $$,
  $$ values (1, 0) $$,
  'la rechazada pasa al historial; la completada que terminó hoy (la devolución) sigue activa hasta mañana'
);
reset role;
update public.pieces set returned_at = now() - interval '2 days' where id = '00000000-0000-0000-0000-0000000042e5';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000042a1","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000042c1',
     p_scope => 'historial') where id = '00000000-0000-0000-0000-0000000042d3'),
  1, 'la completada que terminó antes de hoy pasa al historial'
);
select is(
  (select count(*)::int from public.list_pieces_history(p_query => 'Tapa sin arreglo')),
  1, 'la pieza devuelta va al historial de piezas'
);
select results_eq(
  $$ select quantity from public.list_pieces_history(p_query => 'Tapa sin arreglo') $$,
  $$ values (1) $$,
  'el historial de piezas trae la cantidad'
);

select * from finish();
rollback;
