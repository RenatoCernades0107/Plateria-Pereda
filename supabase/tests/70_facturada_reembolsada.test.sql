begin;

select plan(7);

-- Cotizaciones: Aceptada → Facturada → Reembolsada (final). Las fechas de entrega se
-- conservan; en la reembolsada ya no cambian.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000070a2', 'ventas@facturada.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000070c1', 'persona', 'Fabio', 'Factura');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000070a2","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000070c1"}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');

select throws_ok(
  $$ update public.quotes set status = 'facturada' where id = (select id from ids where name = 'q') $$,
  '23514', null, 'una emitida no pasa directo a facturada'
);

update public.quotes
  set status = 'aceptada', delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q');

select throws_ok(
  $$ update public.quotes set status = 'reembolsada' where id = (select id from ids where name = 'q') $$,
  '23514', null, 'una aceptada no pasa directo a reembolsada'
);

select lives_ok(
  $$ update public.quotes set status = 'facturada' where id = (select id from ids where name = 'q') $$,
  'una aceptada pasa a facturada'
);
select isnt(
  (select delivery_date from public.quotes where id = (select id from ids where name = 'q')),
  null,
  'la facturada conserva la fecha de entrega'
);
select lives_ok(
  $$ update public.quotes set delivery_date = (now() at time zone 'America/Lima')::date + 12
     where id = (select id from ids where name = 'q') $$,
  'la facturada permite cambiar la fecha de entrega'
);
select throws_ok(
  $$ update public.quotes set status = 'anulada' where id = (select id from ids where name = 'q') $$,
  '23514', null, 'una facturada no se anula'
);

update public.quotes set status = 'reembolsada' where id = (select id from ids where name = 'q');
select throws_ok(
  $$ update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q') $$,
  '23514', null, 'la reembolsada es final'
);

select * from finish();
rollback;
