begin;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000060a2', 'ventas@condicion-entrega.test', '{"role":"ventas"}', '{}');

insert into public.clients (id, kind, first_name, last_name, phone)
  values ('00000000-0000-0000-0000-0000000060c1', 'persona', 'Carla', 'Condición', '+51999600001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000060a2","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Valores por defecto de la tabla.
insert into public.quotes (id, client_id)
  values ('00000000-0000-0000-0000-0000000060e1', '00000000-0000-0000-0000-0000000060c1');
select is(
  (select payment_condition::text from public.quotes where id = '00000000-0000-0000-0000-0000000060e1'),
  'contado',
  'la condición de pago por defecto es contado'
);
select is(
  (select delivery_days from public.quotes where id = '00000000-0000-0000-0000-0000000060e1'),
  30,
  'el tiempo de entrega por defecto es 30 días'
);

-- Sin indicarlos: contado y 30 días.
insert into ids select 'sin_datos', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000060c1"}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
select results_eq(
  $$ select payment_condition::text, delivery_days from public.quotes
     where id = (select id from ids where name = 'sin_datos') $$,
  $$ values ('contado', 30) $$,
  'sin indicarlos, la cotización queda al contado y con 30 días de entrega'
);

-- Con valores.
insert into ids select 'q1', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000060c1","payment_condition":"credito","delivery_days":45}',
  '[{"id":"00000000-0000-0000-0000-0000000060f1","title":"Bandeja","quantity":1,"unit_price":"300.00"}]'
);
select results_eq(
  $$ select payment_condition::text, delivery_days from public.quotes
     where id = (select id from ids where name = 'q1') $$,
  $$ values ('credito', 45) $$,
  'guarda la condición de pago y el tiempo de entrega'
);

-- Editar el borrador.
select lives_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q1'),
       '{"client_id":"00000000-0000-0000-0000-0000000060c1","payment_condition":"a_cuenta","delivery_days":10}',
       '[{"id":"00000000-0000-0000-0000-0000000060f1","title":"Bandeja","quantity":1,"unit_price":"300.00"}]'
     ) $$,
  'edita la condición y la entrega del borrador'
);
select results_eq(
  $$ select payment_condition::text, delivery_days from public.quotes
     where id = (select id from ids where name = 'q1') $$,
  $$ values ('a_cuenta', 10) $$,
  'los cambios quedan guardados'
);

-- Fuera de rango.
select throws_ok(
  $$ select public.save_quote(
       null,
       '{"client_id":"00000000-0000-0000-0000-0000000060c1","delivery_days":366}',
       '[{"title":"x","quantity":1,"unit_price":"1.00"}]'
     ) $$,
  '23514', null,
  'el tiempo de entrega no pasa de 365 días'
);
select throws_ok(
  $$ select public.save_quote(
       null,
       '{"client_id":"00000000-0000-0000-0000-0000000060c1","payment_condition":"fiado"}',
       '[{"title":"x","quantity":1,"unit_price":"1.00"}]'
     ) $$,
  '22P02', null,
  'rechaza una condición de pago desconocida'
);

-- Emitida: no se cambian.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q1');
select throws_ok(
  $$ update public.quotes set payment_condition = 'contado'
     where id = (select id from ids where name = 'q1') $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'una emitida no cambia de condición de pago'
);
select throws_ok(
  $$ update public.quotes set delivery_days = 20
     where id = (select id from ids where name = 'q1') $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'una emitida no cambia de tiempo de entrega'
);

-- Duplicar conserva ambos datos.
insert into ids select 'copia', public.duplicate_quote((select id from ids where name = 'q1'));
select results_eq(
  $$ select status::text, payment_condition::text, delivery_days from public.quotes
     where id = (select id from ids where name = 'copia') $$,
  $$ values ('borrador', 'a_cuenta', 10) $$,
  'la copia conserva la condición de pago y el tiempo de entrega'
);

reset role;
select is(
  (select count(*)::int from public.settings where address = ''),
  0,
  'la dirección de la empresa no queda vacía'
);

select * from finish();
rollback;
