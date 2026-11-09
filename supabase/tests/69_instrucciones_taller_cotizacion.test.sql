begin;

select plan(5);

-- Instrucciones para el taller de las cotizaciones (2026-11-06).

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000069a2', 'ventas@taller-cotizacion.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000069c1', 'persona', 'Tito', 'Taller');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000069a2","role":"authenticated"}', true);

insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000069c1"}',
  '[{"title":"Anillo","quantity":1,"unit_price":"100.00"}]'
);
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');

-- Se editan aunque la cotización ya esté emitida.
select lives_ok(
  $$ update public.quotes set workshop_notes = 'Acabado mate'
     where id = (select id from ids where name = 'q') $$,
  'ventas edita las instrucciones de una emitida'
);
select is(
  (select workshop_notes from public.quotes where id = (select id from ids where name = 'q')),
  'Acabado mate', 'se guardan'
);

-- Las notas para el cliente siguen bloqueadas fuera de borrador.
select throws_ok(
  $$ update public.quotes set notes = 'x' where id = (select id from ids where name = 'q') $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'las notas para el cliente siguen sin editarse'
);

select throws_ok(
  $$ update public.quotes set workshop_notes = repeat('a', 2001)
     where id = (select id from ids where name = 'q') $$,
  '23514', null, 'hasta 2000 caracteres'
);

-- Duplicar copia las instrucciones.
insert into ids select 'copia', public.duplicate_quote((select id from ids where name = 'q'));
select is(
  (select workshop_notes from public.quotes where id = (select id from ids where name = 'copia')),
  'Acabado mate', 'duplicar copia las instrucciones para taller'
);

select * from finish();
rollback;
