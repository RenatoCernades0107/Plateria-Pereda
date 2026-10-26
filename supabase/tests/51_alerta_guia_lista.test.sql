begin;

select plan(11);

-- Alerta "Guía lista para entregar" (D77): admin y ventas, cuando el estado general
-- de una guía Normal pasa a Lista. Quien hace el cambio no la recibe.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000051a1', 'admin@lista.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000051a2', 'ventas@lista.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000051a3', 'logistica@lista.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');
update public.profiles set active = false where id::text not like '00000000-0000-0000-0000-0000000051a%';
delete from public.notifications;

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000051c1', 'persona', 'Listas', 'gid://shopify/Customer/51c1');
insert into public.restorations (id, client_id, payment_type, kind) values
  ('00000000-0000-0000-0000-0000000051d1', '00000000-0000-0000-0000-0000000051c1', 'contado', 'normal'),
  ('00000000-0000-0000-0000-0000000051d2', '00000000-0000-0000-0000-0000000051c1', 'contado', 'normal'),
  ('00000000-0000-0000-0000-0000000051d3', '00000000-0000-0000-0000-0000000051c1', 'sin_definir', 'interno');
-- Todas aprobadas y en el taller desde hace una hora.
insert into public.pieces (id, restoration_id, description, price, status, approved_at, first_sent_at, last_sent_at) values
  ('00000000-0000-0000-0000-0000000051e1', '00000000-0000-0000-0000-0000000051d1', 'Fuente', 100, 'aprobada', now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000051e2', '00000000-0000-0000-0000-0000000051d1', 'Jarra', 100, 'aprobada', now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000051e3', '00000000-0000-0000-0000-0000000051d2', 'Vaso', 100, 'aprobada', now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000051e4', '00000000-0000-0000-0000-0000000051d2', 'Copa', 100, 'aprobada', now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000051e5', '00000000-0000-0000-0000-0000000051d3', 'Interna', null, 'aprobada', now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour');
set constraints all immediate;
set constraints all deferred;
delete from public.notifications;

select is(
  (select count(*)::int from public.alert_settings where id = 'guia_lista' and enabled),
  1, 'la alerta "Guía lista" existe y está activa'
);

-- Logística recibe una de las dos piezas de la guía 1: parcialmente lista, sin alerta.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a3","role":"authenticated"}', true);
select public.receive_from_workshop(array['00000000-0000-0000-0000-0000000051e1']::uuid[]);
set constraints all immediate;
set constraints all deferred;
reset role;
select is((select count(*)::int from public.notifications where kind = 'guia_lista'), 0,
  'una guía parcialmente lista no avisa');

-- Recibe la otra: la guía pasa a Lista y avisan admin y ventas (no el actor).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a3","role":"authenticated"}', true);
select public.receive_from_workshop(array['00000000-0000-0000-0000-0000000051e2']::uuid[]);
set constraints all immediate;
set constraints all deferred;
reset role;
select is((select status::text from public.restorations where id = '00000000-0000-0000-0000-0000000051d1'), 'lista',
  'la guía quedó en Lista');
select results_eq(
  $$ select recipient_id, kind::text, data from public.notifications order by recipient_id $$,
  $$ values
    ('00000000-0000-0000-0000-0000000051a1'::uuid, 'guia_lista', '{"live":2,"approved":2,"waiting":0}'::jsonb),
    ('00000000-0000-0000-0000-0000000051a2'::uuid, 'guia_lista', '{"live":2,"approved":2,"waiting":0}'::jsonb) $$,
  'al quedar Lista avisan admin y ventas; logística (quien lo hizo) no'
);

-- Acción masiva sobre la guía 2: una sola alerta por destinatario, con las dos piezas.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a3","role":"authenticated"}', true);
select public.receive_from_workshop(array['00000000-0000-0000-0000-0000000051e3',
  '00000000-0000-0000-0000-0000000051e4']::uuid[]);
set constraints all immediate;
set constraints all deferred;
reset role;
select is((select count(*)::int from public.notifications where kind = 'guia_lista'), 2,
  'una acción masiva da una sola alerta por destinatario');
select is(
  (select count(*)::int from private.notification_events e
   join public.notifications n on n.id = e.notification_id
   where n.recipient_id = '00000000-0000-0000-0000-0000000051a2'),
  2, 'la alerta lleva las dos piezas');

-- Deshacer (borra el evento del historial) se lleva la alerta.
delete from public.piece_status_history
where restoration_id = '00000000-0000-0000-0000-0000000051d2' and event = 'vuelta_taller';
select is((select count(*)::int from public.notifications where kind = 'guia_lista'), 0,
  'deshacer el movimiento borra la alerta');

-- Guía interna: nada.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a3","role":"authenticated"}', true);
select public.receive_from_workshop(array['00000000-0000-0000-0000-0000000051e5']::uuid[]);
set constraints all immediate;
set constraints all deferred;
reset role;
select is((select count(*)::int from public.notifications), 0, 'las guías internas no avisan');

-- Silenciada para ventas y luego desactivada.
update public.pieces set status = 'aprobada', last_returned_at = null, last_sent_at = now() - interval '1 hour'
where restoration_id = '00000000-0000-0000-0000-0000000051d2';
update public.restorations set status = 'aprobada' where id = '00000000-0000-0000-0000-0000000051d2';
update public.alert_settings set muted_user_ids = '{00000000-0000-0000-0000-0000000051a2}' where id = 'guia_lista';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a3","role":"authenticated"}', true);
select public.receive_from_workshop(array['00000000-0000-0000-0000-0000000051e3',
  '00000000-0000-0000-0000-0000000051e4']::uuid[]);
set constraints all immediate;
set constraints all deferred;
reset role;
select results_eq(
  $$ select recipient_id from public.notifications where kind = 'guia_lista' $$,
  $$ values ('00000000-0000-0000-0000-0000000051a1'::uuid) $$,
  'quien la silenció no la recibe'
);

delete from public.notifications;
update public.alert_settings set enabled = false, muted_user_ids = '{}' where id = 'guia_lista';
update public.pieces set status = 'aprobada', last_returned_at = null, last_sent_at = now() - interval '1 hour'
where restoration_id = '00000000-0000-0000-0000-0000000051d2';
update public.restorations set status = 'aprobada' where id = '00000000-0000-0000-0000-0000000051d2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a3","role":"authenticated"}', true);
select public.receive_from_workshop(array['00000000-0000-0000-0000-0000000051e3',
  '00000000-0000-0000-0000-0000000051e4']::uuid[]);
set constraints all immediate;
set constraints all deferred;
reset role;
select is((select count(*)::int from public.notifications), 0, 'desactivada, no llega');

-- Los roles: logística no la recibe aunque no sea quien lo hace.
select is(private.alert_roles('guia_lista')::text, '{admin,ventas}', 'solo admin y ventas');

select * from finish();
rollback;
