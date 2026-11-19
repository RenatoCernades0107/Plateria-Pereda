begin;

select plan(14);

-- Alertas de cotizaciones: al pasar a Aceptada avisa a logística; al pasar a Facturada,
-- a administración. Quien hace el cambio no la recibe; logística no ve al cliente.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000075a1', 'admin@cotalerta.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000075a2', 'ventas@cotalerta.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000075a3', 'logistica@cotalerta.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');
update public.profiles set active = false where id::text not like '00000000-0000-0000-0000-0000000075a%';
delete from public.notifications;

insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000075c1', 'persona', 'Carla', 'Cotiza');

select is(
  (select count(*)::int from public.alert_settings
   where id in ('cotizacion_aceptada', 'cotizacion_facturada') and enabled),
  2, 'las alertas de cotizaciones existen y están activas'
);
select is(private.alert_roles('cotizacion_aceptada')::text, '{logistica}', 'aceptada: solo logística');
select is(private.alert_roles('cotizacion_facturada')::text, '{admin}', 'facturada: solo admin');

-- Ventas emite y acepta una cotización.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000075c1"}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');
reset role;
select is((select count(*)::int from public.notifications), 0, 'emitir no avisa a nadie');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q');
reset role;
select results_eq(
  $$ select recipient_id, kind::text, restoration_id is null, actor_name from public.notifications $$,
  $$ values ('00000000-0000-0000-0000-0000000075a3'::uuid, 'cotizacion_aceptada', true, 'Vera Ventas') $$,
  'al aceptar avisa solo a logística (no a admin ni a ventas, que lo hizo)'
);

-- Logística ve el código pero no al cliente.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a3","role":"authenticated"}', true);
select results_eq(
  $$ select kind::text, quote_code like 'COT-%', client_name from public.my_notifications() $$,
  $$ values ('cotizacion_aceptada', true, null::text) $$,
  'logística ve la alerta con el código y sin el cliente'
);
reset role;

-- Ventas facturó: avisa a admin.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
update public.quotes set status = 'facturada' where id = (select id from ids where name = 'q');
reset role;
select results_eq(
  $$ select recipient_id, kind::text from public.notifications $$,
  $$ values ('00000000-0000-0000-0000-0000000075a1'::uuid, 'cotizacion_facturada') $$,
  'al facturar avisa solo a administración'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a1","role":"authenticated"}', true);
select results_eq(
  $$ select kind::text, quote_code like 'COT-%', client_name from public.my_notifications() $$,
  $$ values ('cotizacion_facturada', true, 'Carla Cotiza') $$,
  'admin ve la alerta con el cliente'
);
reset role;

-- Quien factura no recibe su propia alerta (admin factura otra cotización).
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a1","role":"authenticated"}', true);
insert into ids select 'q2', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000075c1"}',
  '[{"title":"Collar","quantity":1,"unit_price":"50.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q2');
update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q2');
update public.quotes set status = 'facturada' where id = (select id from ids where name = 'q2');
reset role;
select is(
  (select count(*)::int from public.notifications where kind = 'cotizacion_facturada'), 0,
  'quien factura no recibe su propia alerta'
);

-- Desactivada, silenciada u otros estados: no avisan. Una tercera cotización de ventas.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
insert into ids select 'q3', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000075c1"}',
  '[{"title":"Pulsera","quantity":1,"unit_price":"10.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q3');
reset role;

update public.alert_settings set enabled = false where id = 'cotizacion_aceptada';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q3');
reset role;
select is((select count(*)::int from public.notifications), 0, 'una alerta desactivada no avisa');

-- Silenciada para logística: vuelve a emitirse y aceptarse.
update public.alert_settings
  set enabled = true, muted_user_ids = '{00000000-0000-0000-0000-0000000075a3}'
  where id = 'cotizacion_aceptada';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q3');
update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q3');
reset role;
select is((select count(*)::int from public.notifications), 0, 'un usuario silenciado no la recibe');

-- Anular no avisa.
update public.alert_settings set muted_user_ids = '{}' where id = 'cotizacion_aceptada';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000075a2","role":"authenticated"}', true);
update public.quotes set status = 'anulada' where id = (select id from ids where name = 'q3');
reset role;
select is((select count(*)::int from public.notifications), 0, 'anular no avisa');

-- Una alerta es de una guía o de una cotización; al borrar la cotización se va la alerta.
select throws_ok(
  $$ insert into public.notifications (recipient_id, kind, txid)
     values ('00000000-0000-0000-0000-0000000075a3', 'cotizacion_aceptada', 2) $$,
  '23514', null, 'una alerta pertenece a una guía o a una cotización'
);
insert into public.notifications (recipient_id, kind, quote_id, txid)
  values ('00000000-0000-0000-0000-0000000075a3', 'cotizacion_aceptada',
    (select id from ids where name = 'q3'), 1);
delete from public.quotes where id = (select id from ids where name = 'q3');
select is(
  (select count(*)::int from public.notifications where kind = 'cotizacion_aceptada'),
  0, 'al borrar la cotización se van sus alertas'
);

select * from finish();
rollback;
