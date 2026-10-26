begin;

select plan(20);

-- Alertas de la campana (D76): aprobación (admin y logística) y espera del cliente
-- (admin y ventas). Se calculan al confirmar: aquí, con `set constraints all immediate`.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000050a1', 'admin@alertas.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000050a2', 'ventas@alertas.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000050a3', 'logistica@alertas.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000050a4', 'ventas2@alertas.test', '{"role":"ventas"}', '{"full_name":"Vico Ventas"}');
-- Solo cuentan los usuarios de este test.
update public.profiles set active = false where id::text not like '00000000-0000-0000-0000-0000000050a%';
delete from public.notifications;

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000050c1', 'persona', 'Alertas', 'gid://shopify/Customer/50c1');
insert into public.restorations (id, client_id, payment_type, kind) values
  ('00000000-0000-0000-0000-0000000050d1', '00000000-0000-0000-0000-0000000050c1', 'contado', 'normal'),
  ('00000000-0000-0000-0000-0000000050d2', '00000000-0000-0000-0000-0000000050c1', 'contado', 'normal'),
  ('00000000-0000-0000-0000-0000000050d3', '00000000-0000-0000-0000-0000000050c1', 'sin_definir', 'interno');
insert into public.pieces (id, restoration_id, description, price, status) values
  ('00000000-0000-0000-0000-0000000050e1', '00000000-0000-0000-0000-0000000050d1', 'Fuente', 100, 'registrada'),
  ('00000000-0000-0000-0000-0000000050e2', '00000000-0000-0000-0000-0000000050d1', 'Jarra', 100, 'registrada'),
  ('00000000-0000-0000-0000-0000000050e3', '00000000-0000-0000-0000-0000000050d1', 'Vaso', 100, 'registrada'),
  ('00000000-0000-0000-0000-0000000050e4', '00000000-0000-0000-0000-0000000050d1', 'Copa', 100, 'registrada'),
  ('00000000-0000-0000-0000-0000000050e5', '00000000-0000-0000-0000-0000000050d2', 'Bandeja', 100, 'en_consulta'),
  ('00000000-0000-0000-0000-0000000050e6', '00000000-0000-0000-0000-0000000050d2', 'Plato', 100, 'en_consulta'),
  ('00000000-0000-0000-0000-0000000050e8', '00000000-0000-0000-0000-0000000050d2', 'Cuchara', 100, 'anulada');
-- El registro de las piezas no genera alertas (ninguna aprobada ni en espera).
set constraints all immediate;
set constraints all deferred;

select is((select count(*)::int from public.notifications), 0, 'registrar piezas sin aprobar no avisa');

-- Ventas aprueba 2 de 4 en una sola acción.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a2","role":"authenticated"}', true);
select public.change_piece_status(array['00000000-0000-0000-0000-0000000050e1',
  '00000000-0000-0000-0000-0000000050e2']::uuid[], 'aprobada');
set constraints all immediate;
set constraints all deferred;
reset role;

select results_eq(
  $$ select recipient_id, kind::text, data from public.notifications order by recipient_id $$,
  $$ values
    ('00000000-0000-0000-0000-0000000050a1'::uuid, 'aprobacion_parcial', '{"live":4,"approved":2,"waiting":0}'::jsonb),
    ('00000000-0000-0000-0000-0000000050a3'::uuid, 'aprobacion_parcial', '{"live":4,"approved":2,"waiting":0}'::jsonb) $$,
  'aprobar 2 de 4: una alerta parcial para admin y logística (no para ventas)'
);
select is(
  (select count(*)::int from private.notification_events e
   join public.notifications n on n.id = e.notification_id
   where n.recipient_id = '00000000-0000-0000-0000-0000000050a3'),
  2, 'la alerta lleva las dos piezas aprobadas'
);

-- El admin aprueba las otras dos: total, y el admin (quien aprueba) no se avisa a sí mismo.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a1","role":"authenticated"}', true);
select public.change_piece_status(array['00000000-0000-0000-0000-0000000050e3',
  '00000000-0000-0000-0000-0000000050e4']::uuid[], 'aprobada');
set constraints all immediate;
set constraints all deferred;
reset role;

select results_eq(
  $$ select recipient_id, data from public.notifications where kind = 'aprobacion_total' $$,
  $$ values ('00000000-0000-0000-0000-0000000050a3'::uuid, '{"live":4,"approved":4,"waiting":0}'::jsonb) $$,
  'aprobar la última: alerta total solo para logística (el admin lo hizo)'
);

-- Logística lee sus alertas sin el cliente; ventas, con el cliente.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a3","role":"authenticated"}', true);
select results_eq(
  $$ select kind::text, client_name, jsonb_array_length(pieces), unread_count
     from public.my_notifications() order by kind $$,
  $$ values ('aprobacion_parcial', null::text, 2, 2::bigint), ('aprobacion_total', null::text, 2, 2::bigint) $$,
  'logística ve sus alertas con las piezas y sin el nombre del cliente'
);
select is(
  (select count(*)::int from public.notifications), 2, 'cada usuario lee solo sus alertas'
);
update public.notifications set read_at = now() where kind = 'aprobacion_parcial';
select is(
  (select unread_count from public.my_notifications() limit 1), 1::bigint, 'marca sus alertas como leídas'
);
select throws_ok(
  $$ update public.notifications set kind = 'guia_en_espera' $$,
  '42501', null, 'solo puede cambiar read_at'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a2","role":"authenticated"}', true);
update public.notifications set read_at = now();
reset role;
select is(
  (select count(*)::int from public.notifications
   where recipient_id = '00000000-0000-0000-0000-0000000050a1' and read_at is null),
  1, 'no marca las alertas de otro'
);

-- Espera del cliente: Bandeja pasa a espera (Plato sigue en Consulta).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a3","role":"authenticated"}', true);
select public.change_piece_status(array['00000000-0000-0000-0000-0000000050e5']::uuid[], 'en_espera');
set constraints all immediate;
set constraints all deferred;
reset role;

select results_eq(
  $$ select recipient_id, kind::text from public.notifications
     where restoration_id = '00000000-0000-0000-0000-0000000050d2' order by recipient_id $$,
  $$ values
    ('00000000-0000-0000-0000-0000000050a1'::uuid, 'pieza_en_espera'),
    ('00000000-0000-0000-0000-0000000050a2'::uuid, 'pieza_en_espera'),
    ('00000000-0000-0000-0000-0000000050a4'::uuid, 'pieza_en_espera') $$,
  'una pieza en espera avisa a admin y ventas'
);

-- El admin silencia "Guía en espera" para Vera y "Pieza en espera" para Vico.
update public.alert_settings set muted_user_ids = '{00000000-0000-0000-0000-0000000050a2}' where id = 'guia_en_espera';
update public.alert_settings set muted_user_ids = '{00000000-0000-0000-0000-0000000050a4}' where id = 'pieza_en_espera';

-- Plato pasa a espera: todas las piezas vivas (la anulada no cuenta) esperan.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a3","role":"authenticated"}', true);
select public.change_piece_status(array['00000000-0000-0000-0000-0000000050e6']::uuid[], 'en_espera');
set constraints all immediate;
set constraints all deferred;
reset role;

select results_eq(
  $$ select recipient_id, kind::text from public.notifications n
     where restoration_id = '00000000-0000-0000-0000-0000000050d2'
       and exists (select 1 from private.notification_events e
                   where e.notification_id = n.id and e.piece_id = '00000000-0000-0000-0000-0000000050e6')
     order by recipient_id $$,
  $$ values
    ('00000000-0000-0000-0000-0000000050a1'::uuid, 'guia_en_espera'),
    ('00000000-0000-0000-0000-0000000050a2'::uuid, 'pieza_en_espera'),
    ('00000000-0000-0000-0000-0000000050a4'::uuid, 'guia_en_espera') $$,
  'guía toda en espera: "Guía en espera" en lugar de "Pieza", salvo a quien la silenció'
);

-- Retroceder Plato a Consulta: sale de sus alertas (y la alerta sin piezas se borra).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a1","role":"authenticated"}', true);
select public.undo_piece_status('00000000-0000-0000-0000-0000000050e6', 'Fue un error');
set constraints all immediate;
set constraints all deferred;
reset role;
select is(
  (select count(*)::int from private.notification_events where piece_id = '00000000-0000-0000-0000-0000000050e6'),
  0, 'retroceder quita la pieza de las alertas'
);
select is(
  (select count(*)::int from public.notifications where kind = 'guia_en_espera'),
  0, 'la alerta que se queda sin piezas se borra'
);

-- Deshacer (borra el evento del historial) se lleva la alerta.
delete from public.piece_status_history
where piece_id = '00000000-0000-0000-0000-0000000050e5' and to_status = 'en_espera';
select is(
  (select count(*)::int from public.notifications where kind = 'pieza_en_espera'
     and restoration_id = '00000000-0000-0000-0000-0000000050d2'
     and not exists (select 1 from private.notification_events e where e.notification_id = notifications.id)),
  0, 'no quedan alertas sin piezas al borrar el evento'
);
select is(
  (select count(*)::int from private.notification_events where piece_id = '00000000-0000-0000-0000-0000000050e5'),
  0, 'deshacer el movimiento quita la pieza de las alertas'
);

-- Alerta desactivada: nada. Guía interna: nada.
delete from public.notifications;
update public.alert_settings set enabled = false where id = 'pieza_en_espera';
update public.alert_settings set muted_user_ids = '{}';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a3","role":"authenticated"}', true);
select public.change_piece_status(array['00000000-0000-0000-0000-0000000050e6']::uuid[], 'en_espera');
set constraints all immediate;
set constraints all deferred;
reset role;
select results_eq(
  $$ select distinct kind::text from public.notifications $$,
  $$ values ('guia_en_espera') $$,
  'la alerta desactivada no llega (la de guía sí, porque está activa)'
);

delete from public.notifications;
insert into public.pieces (id, restoration_id, description, price, status) values
  ('00000000-0000-0000-0000-0000000050e7', '00000000-0000-0000-0000-0000000050d3', 'Interna', null, 'aprobada');
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.notifications), 0, 'las guías internas no avisan');

-- Configuración: todos leen, solo admin edita.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a2","role":"authenticated"}', true);
select is((select count(*)::int from public.alert_settings), 5, 'todos leen la configuración de alertas');
update public.alert_settings set enabled = true;
reset role;
select is(
  (select count(*)::int from public.alert_settings where not enabled), 1, 'ventas no edita las alertas'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a1","role":"authenticated"}', true);
update public.alert_settings set enabled = true;
reset role;
select is(
  (select count(*)::int from public.alert_settings where not enabled), 0, 'el admin edita las alertas'
);

select * from finish();
rollback;
