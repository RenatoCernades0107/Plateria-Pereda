begin;

select plan(14);

-- Hoy en Lima (sin pasar por el esquema `private`, que `authenticated` no ve).
create function pg_temp.current_date_lima() returns date language sql stable
  as $$ select (now() at time zone 'America/Lima')::date $$;

-- Fechas de entrega de las cotizaciones aceptadas (2026-11-03): al aceptarla se indica
-- la de entrega (obligatoria) y la del proveedor (por defecto 3 días antes, sin pasar
-- de hoy, nunca posterior). Solo en aceptadas; volver a emitida las borra.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000067a2', 'ventas@fechas-cotizacion.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000067a3', 'logistica@fechas-cotizacion.test', '{"role":"logistica"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000067c1', 'persona', 'Elsa', 'Entrega');

select has_column('public', 'quotes', 'delivery_date', 'la cotización guarda la fecha de entrega');
select has_column('public', 'quotes', 'supplier_delivery_date', 'y la del proveedor');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000067a2","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000067c1"}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');

-- En una emitida no se guardan.
update public.quotes set delivery_date = pg_temp.current_date_lima() + 10
  where id = (select id from ids where name = 'q');
select is(
  (select delivery_date from public.quotes where id = (select id from ids where name = 'q')),
  null,
  'una cotización emitida no lleva fechas de entrega'
);

select throws_ok(
  $$ update public.quotes set status = 'aceptada' where id = (select id from ids where name = 'q') $$,
  '23514', 'Indica la fecha de entrega.',
  'no se acepta sin fecha de entrega'
);
select throws_ok(
  $$ update public.quotes set status = 'aceptada', delivery_date = pg_temp.current_date_lima() - 1
     where id = (select id from ids where name = 'q') $$,
  '23514', 'La fecha de entrega no puede ser anterior a hoy.',
  'la fecha de entrega no es anterior a hoy'
);
select throws_ok(
  $$ update public.quotes set status = 'aceptada', delivery_date = pg_temp.current_date_lima() + 5,
       supplier_delivery_date = pg_temp.current_date_lima() + 6
     where id = (select id from ids where name = 'q') $$,
  '23514', 'La fecha del proveedor no puede ser posterior a la de entrega.',
  'la del proveedor no es posterior a la de entrega'
);

-- Sin la del proveedor: 3 días antes.
update public.quotes set status = 'aceptada', delivery_date = pg_temp.current_date_lima() + 10
  where id = (select id from ids where name = 'q');
select results_eq(
  $$ select delivery_date - pg_temp.current_date_lima(), supplier_delivery_date - pg_temp.current_date_lima()
     from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (10, 7) $$,
  'por defecto el proveedor entrega 3 días antes'
);

-- Se cambian en la aceptada.
update public.quotes set supplier_delivery_date = pg_temp.current_date_lima() + 4
  where id = (select id from ids where name = 'q');
select is(
  (select supplier_delivery_date - pg_temp.current_date_lima() from public.quotes
   where id = (select id from ids where name = 'q')),
  4,
  'la fecha del proveedor se puede cambiar'
);

-- Adelantar la entrega por delante de la del proveedor (sin tocarla) la recalcula,
-- sin pasar de hoy.
update public.quotes set delivery_date = pg_temp.current_date_lima() + 2
  where id = (select id from ids where name = 'q');
select results_eq(
  $$ select delivery_date - pg_temp.current_date_lima(), supplier_delivery_date - pg_temp.current_date_lima()
     from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (2, 0) $$,
  'si la entrega se adelanta, la del proveedor se recalcula sin pasar de hoy'
);

select throws_ok(
  $$ update public.quotes set delivery_date = null where id = (select id from ids where name = 'q') $$,
  '23514', 'Indica la fecha de entrega.',
  'no se borra la fecha de entrega de una aceptada'
);

-- Logística no las cambia (no edita cotizaciones).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000067a3","role":"authenticated"}', true);
update public.quotes set supplier_delivery_date = pg_temp.current_date_lima() + 1
  where id = (select id from ids where name = 'q');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000067a2","role":"authenticated"}', true);
select is(
  (select supplier_delivery_date - pg_temp.current_date_lima() from public.quotes
   where id = (select id from ids where name = 'q')),
  0,
  'logística no cambia las fechas de entrega'
);

-- Volver a emitida las borra.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');
select results_eq(
  $$ select delivery_date, supplier_delivery_date from public.quotes
     where id = (select id from ids where name = 'q') $$,
  $$ values (null::date, null::date) $$,
  'al volver a emitida se borran las fechas'
);

-- Duplicar no copia las fechas.
update public.quotes set status = 'aceptada', delivery_date = pg_temp.current_date_lima() + 9
  where id = (select id from ids where name = 'q');
insert into ids select 'copia', public.duplicate_quote((select id from ids where name = 'q'));
select results_eq(
  $$ select delivery_date, supplier_delivery_date from public.quotes
     where id = (select id from ids where name = 'copia') $$,
  $$ values (null::date, null::date) $$,
  'la copia (borrador) no lleva fechas de entrega'
);

-- Las aceptadas de antes pueden seguir sin fecha (p. ej. al rechazar no se exige nada).
reset role;
alter table public.quotes disable trigger quotes_guard_update;
update public.quotes set delivery_date = null, supplier_delivery_date = null
  where id = (select id from ids where name = 'q');
alter table public.quotes enable trigger quotes_guard_update;
set local role authenticated;
select lives_ok(
  $$ update public.quotes set notes = notes where id = (select id from ids where name = 'q') $$,
  'una aceptada de antes sin fecha se sigue pudiendo actualizar'
);

select * from finish();
rollback;
