begin;

select plan(13);

-- Notificaciones push de las alertas: dispositivos por usuario, alertas pendientes de
-- envío (solo el servidor) y aviso a la app con pg_net al crearse alertas.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000063a1', 'admin@push.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000063a2', 'ventas@push.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000063a3', 'logistica@push.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');
delete from public.notifications;
delete from net.http_request_queue;

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000063c1', 'persona', 'Push', 'gid://shopify/Customer/63c1');
insert into public.restorations (id, client_id, payment_type, kind) values
  ('00000000-0000-0000-0000-0000000063d1', '00000000-0000-0000-0000-0000000063c1', 'contado', 'normal');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000063a2', 'https://push.test/ventas', 'k', 'a'),
  ('00000000-0000-0000-0000-0000000063a3', 'https://push.test/logistica', 'k', 'a');

-- 1. Cada usuario ve y quita solo sus dispositivos; no los registra directo.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a2","role":"authenticated"}', true);
select is((select count(*)::int from public.push_subscriptions), 1, 'ventas solo ve su dispositivo');
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('00000000-0000-0000-0000-0000000063a2', 'https://push.test/otro', 'k', 'a') $$,
  '42501', null, 'el dispositivo lo registra el servidor, no el navegador'
);
delete from public.push_subscriptions where endpoint = 'https://push.test/logistica';
select throws_ok(
  $$ select * from public.claim_push_notifications() $$,
  '42501', null, 'un usuario no puede tomar las alertas pendientes'
);
reset role;
select is((select count(*)::int from public.push_subscriptions), 2, 'no borra el dispositivo de otro usuario');

-- 2. Sin la URL y el secreto en Vault, crear alertas no llama a nadie.
insert into public.notifications (recipient_id, kind, restoration_id, data, txid) values
  ('00000000-0000-0000-0000-0000000063a1', 'aprobacion_total', '00000000-0000-0000-0000-0000000063d1', '{}', 1);
select is((select count(*)::int from net.http_request_queue), 0, 'sin configurar no pide el envío');

-- 3. Configurado: un pedido por sentencia, con el secreto.
select vault.create_secret('https://pereda.test/api/webhooks/push', 'push_dispatch_url');
select vault.create_secret('secreto-de-prueba', 'push_dispatch_secret');
insert into public.notifications (recipient_id, kind, restoration_id, data, txid, actor_name) values
  ('00000000-0000-0000-0000-0000000063a2', 'pieza_en_espera', '00000000-0000-0000-0000-0000000063d1', '{"live":2}', 2, 'Ana Admin'),
  ('00000000-0000-0000-0000-0000000063a3', 'aprobacion_total', '00000000-0000-0000-0000-0000000063d1', '{"live":2}', 2, 'Ana Admin');
select is((select count(*)::int from net.http_request_queue), 1, 'una alerta masiva pide un solo envío');
select is(
  (select url from net.http_request_queue),
  'https://pereda.test/api/webhooks/push', 'llama a la ruta configurada'
);
select is(
  (select headers ->> 'Authorization' from net.http_request_queue),
  'Bearer secreto-de-prueba', 'con el secreto de Vault'
);

-- 4. El servidor toma las pendientes: solo de quien tiene dispositivo, una sola vez,
-- y sin el cliente para logística.
insert into public.notifications (recipient_id, kind, restoration_id, data, txid, created_at) values
  ('00000000-0000-0000-0000-0000000063a2', 'guia_lista', '00000000-0000-0000-0000-0000000063d1', '{}', 3, now() - interval '2 hours');
set local role service_role;
create temp table claimed on commit drop as select * from public.claim_push_notifications();
select results_eq(
  $$ select recipient_id, kind::text, restoration_code is not null, client_name, actor_name from claimed order by recipient_id $$,
  $$ values
    ('00000000-0000-0000-0000-0000000063a2'::uuid, 'pieza_en_espera', true, 'Push'::text, 'Ana Admin'::text),
    ('00000000-0000-0000-0000-0000000063a3'::uuid, 'aprobacion_total', true, null, 'Ana Admin') $$,
  'toma las recientes de quien tiene dispositivo; logística no ve al cliente'
);
select is((select count(*)::int from public.claim_push_notifications()), 0, 'no se envían dos veces');
reset role;
select is(
  (select count(*)::int from public.notifications where pushed_at is not null), 2,
  'marca las enviadas'
);
select ok(
  (select pushed_at is null from public.notifications where txid = 1),
  'la del admin sin dispositivo queda sin enviar'
);
select ok(
  (select pushed_at is null from public.notifications where txid = 3),
  'las de hace más de una hora no se envían'
);

select * from finish();
rollback;
