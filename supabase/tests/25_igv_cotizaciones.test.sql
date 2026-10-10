begin;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000025a01', 'ventas@igv-cot.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-000000025c01', 'persona', 'Iris', 'Igv');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000025a01","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- 2 × 50.00 + 100.00 con 10 % de descuento = 190.00; sin IGV, cada línea + 18 %.
insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-000000025c01","prices_include_igv":false}',
  '[{"title":"Anillo","quantity":2,"unit_price":"50.00"},
    {"title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
);

select results_eq(
  $$ select prices_include_igv, subtotal, discount_total, total from public.quotes
     where id = (select id from ids where name = 'q') $$,
  $$ values (false, 200.00::numeric, 10.00::numeric, 224.20::numeric) $$,
  'sin IGV incluido el total suma el 18 % de cada línea'
);

select lives_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q'),
       '{"client_id":"00000000-0000-0000-0000-000000025c01","prices_include_igv":true}',
       '[{"title":"Anillo","quantity":2,"unit_price":"50.00"}]'
     ) $$,
  'se cambia la respuesta en borrador'
);
select is(
  (select total from public.quotes where id = (select id from ids where name = 'q')),
  100.00::numeric, 'con IGV incluido el total es la suma de las líneas'
);

update public.quotes set prices_include_igv = false where id = (select id from ids where name = 'q');
select is(
  (select total from public.quotes where id = (select id from ids where name = 'q')),
  118.00::numeric, 'cambiar la respuesta recalcula el total'
);

insert into ids select 'dup', public.duplicate_quote((select id from ids where name = 'q'));
select is(
  (select prices_include_igv from public.quotes where id = (select id from ids where name = 'dup')),
  false, 'duplicar conserva la respuesta'
);

update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');
select throws_ok(
  $$ update public.quotes set prices_include_igv = true where id = (select id from ids where name = 'q') $$,
  '23514', null, 'emitida ya no se cambia'
);

select * from finish();
rollback;
