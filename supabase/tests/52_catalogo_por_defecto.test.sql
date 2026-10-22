begin;

select plan(5);

insert into public.materials (name) values ('Plata por defecto'), ('Oro por defecto');
insert into public.services (name) values ('Limpieza por defecto'), ('Pulido por defecto');

select lives_ok(
  $$ update public.materials set is_default = true where name = 'Plata por defecto' $$,
  'se marca un material por defecto'
);
select throws_ok(
  $$ update public.materials set is_default = true where name = 'Oro por defecto' $$,
  '23505', null, 'solo hay un material por defecto'
);
select lives_ok(
  $$ update public.services set is_default = true where name = 'Limpieza por defecto' $$,
  'se marca un servicio por defecto, aparte del material'
);
select throws_ok(
  $$ update public.services set active = false where name = 'Limpieza por defecto' $$,
  '23514', null, 'el de por defecto no se desactiva sin quitarle la marca'
);
select throws_ok(
  $$ insert into public.services (name, active, is_default) values ('Baño inactivo', false, true) $$,
  '23514', null, 'uno inactivo no puede ser el de por defecto'
);

select * from finish();
rollback;
