begin;

select plan(15);

-- Días de crédito y sucursal emisora de las cotizaciones (2026-11-04).

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000068a1', 'admin@sucursal-cotizacion.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000068a2', 'ventas@sucursal-cotizacion.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000068a3', 'logistica@sucursal-cotizacion.test', '{"role":"logistica"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000068c1', 'persona', 'Cora', 'Crédito');

select results_eq(
  $$ select name, document_type, document_number, account_number, cci
     from public.quote_issuers order by name $$,
  $$ values
    ('CARMEN', 'dni', '07863594', '19493993660088', '00219419399366008899'),
    ('PEREDA SAC', 'ruc', '20557169866', '1942229780029', '00219400222978002998'),
    ('PEREDA''S CTA SRL.', 'ruc', '20124352828', '1940637923065', '00219400063792306596') $$,
  'vienen las tres sucursales de cotización'
);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'sac', id from public.quote_issuers where name = 'PEREDA SAC';
insert into ids select 'carmen', id from public.quote_issuers where name = 'CARMEN';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000068a2","role":"authenticated"}', true);

-- Crédito: por defecto 30 días; se indican otros.
insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000068c1","payment_condition":"credito"}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
select is(
  (select credit_days from public.quotes where id = (select id from ids where name = 'q')),
  30, 'crédito sin días: 30 por defecto'
);

select public.save_quote(
  (select id from ids where name = 'q'),
  jsonb_build_object(
    'client_id', '00000000-0000-0000-0000-0000000068c1',
    'payment_condition', 'credito', 'credit_days', 45,
    'issuer_id', (select id from ids where name = 'sac')
  ),
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
select results_eq(
  $$ select credit_days, issuer_id from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ select 45, (select id from ids where name = 'sac') $$,
  'guarda los días de crédito y la sucursal'
);

-- Al pasar a contado, los días se borran.
select public.save_quote(
  (select id from ids where name = 'q'),
  '{"client_id":"00000000-0000-0000-0000-0000000068c1","payment_condition":"contado","credit_days":45}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
select is(
  (select credit_days from public.quotes where id = (select id from ids where name = 'q')),
  null, 'sin crédito no hay días de crédito'
);
select is(
  (select issuer_id from public.quotes where id = (select id from ids where name = 'q')),
  (select id from ids where name = 'sac'),
  'sin issuer_id en los datos, se conserva la sucursal'
);

select throws_ok(
  $$ update public.quotes set credit_days = 400 where id = (select id from ids where name = 'q') $$,
  '23514', null, 'los días de crédito van de 1 a 365'
);
select throws_ok(
  $$ update public.quotes set payment_condition = 'credito' where id = (select id from ids where name = 'q') $$,
  '23514', null, 'crédito exige los días'
);

update public.quotes set payment_condition = 'credito', credit_days = 15
  where id = (select id from ids where name = 'q');

-- Duplicar copia los días y la sucursal.
insert into ids select 'copia', public.duplicate_quote((select id from ids where name = 'q'));
select results_eq(
  $$ select credit_days, issuer_id from public.quotes where id = (select id from ids where name = 'copia') $$,
  $$ select 15, (select id from ids where name = 'sac') $$,
  'la copia conserva los días de crédito y la sucursal'
);

-- Emitida: los días de crédito no cambian, la sucursal sí.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');
select throws_ok(
  $$ update public.quotes set credit_days = 60 where id = (select id from ids where name = 'q') $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'en una emitida no cambian los días de crédito'
);
update public.quotes set issuer_id = (select id from ids where name = 'carmen')
  where id = (select id from ids where name = 'q');
select is(
  (select issuer_id from public.quotes where id = (select id from ids where name = 'q')),
  (select id from ids where name = 'carmen'),
  'en una emitida se puede cambiar la sucursal'
);

-- Ventas lee las sucursales pero no las edita.
select is((select count(*)::int from public.quote_issuers), 3, 'ventas lee las sucursales');
update public.quote_issuers set cci = '00000000000000000000'
  where id = (select id from ids where name = 'sac');
select is(
  (select cci from public.quote_issuers where id = (select id from ids where name = 'sac')),
  '00219400222978002998', 'ventas no edita las sucursales'
);

-- Logística no ve los datos bancarios.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000068a3","role":"authenticated"}', true);
select is((select count(*)::int from public.quote_issuers), 0, 'logística no ve las sucursales');

-- El admin las gestiona; no borra una en uso.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000068a1","role":"authenticated"}', true);
select throws_ok(
  $$ delete from public.quote_issuers where id = (select id from ids where name = 'carmen') $$,
  '23503', '“CARMEN” está en uso en 1 cotización. Desactívala en su lugar.',
  'no se borra una sucursal en uso'
);
select throws_ok(
  $$ update public.quote_issuers set document_number = '123' where id = (select id from ids where name = 'sac') $$,
  '23514', null, 'el RUC debe tener 11 dígitos'
);

reset role;
select * from finish();
rollback;
