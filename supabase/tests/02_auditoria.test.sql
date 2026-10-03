begin;

select plan(21);

select has_table('public', 'audit_log', 'existe la tabla audit_log');
select has_function('audit', 'log_change', 'existe audit.log_change()');
select has_function('audit', 'enable', array['regclass', 'text[]'], 'existe audit.enable()');
select has_trigger('public', 'profiles', 'audit_changes', 'profiles está auditada');

-- Tabla de prueba con una columna que no se registra.
create table public.prueba_auditoria (
  id int primary key,
  nombre text,
  nota text,
  clave text,
  updated_at timestamptz not null default now()
);
select audit.enable('public.prueba_auditoria', '{clave}');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'admin@auditoria.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'ventas@auditoria.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'logistica@auditoria.test', '{"role":"logistica"}', '{"full_name":"Lola Logística"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'otro@auditoria.test', '{"role":"ventas"}', '{"full_name":"Otro Usuario"}');

-- Insert
insert into public.prueba_auditoria (id, nombre, nota, clave) values (1, 'Taller A', null, 'x');
select is(
  (select changes from public.audit_log where table_name = 'prueba_auditoria' and action = 'insert'),
  '{"nombre": {"old": null, "new": "Taller A"}}'::jsonb,
  'insert guarda las columnas con valor, sin id, fechas ni columnas ignoradas'
);
select is(
  (select record_id from public.audit_log where table_name = 'prueba_auditoria' and action = 'insert'),
  '1',
  'record_id es el id de la fila'
);
select is(
  (select actor_id from public.audit_log where table_name = 'prueba_auditoria' and action = 'insert'),
  null,
  'sin usuario autenticado el actor queda vacío (sistema)'
);

-- Update como un usuario autenticado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
update public.prueba_auditoria set nombre = 'Taller B', nota = 'urgente', clave = 'y' where id = 1;
select is(
  (select changes from public.audit_log where table_name = 'prueba_auditoria' and action = 'update'),
  '{"nombre": {"old": "Taller A", "new": "Taller B"}, "nota": {"old": null, "new": "urgente"}}'::jsonb,
  'update guarda solo las columnas cambiadas con su valor anterior y nuevo'
);
select results_eq(
  $$ select actor_id, actor_name from public.audit_log
     where table_name = 'prueba_auditoria' and action = 'update' $$,
  $$ values ('00000000-0000-0000-0000-0000000000b2'::uuid, 'Vera Ventas') $$,
  'el actor es el usuario autenticado, con su nombre'
);

update public.prueba_auditoria set clave = 'z' where id = 1;
update public.prueba_auditoria set nombre = 'Taller B' where id = 1;
select is(
  (select count(*)::int from public.audit_log where table_name = 'prueba_auditoria' and action = 'update'),
  1,
  'un update sin cambios registrables no deja registro'
);

-- Delete
delete from public.prueba_auditoria where id = 1;
select is(
  (select changes from public.audit_log where table_name = 'prueba_auditoria' and action = 'delete'),
  '{"nombre": {"old": "Taller B", "new": null}, "nota": {"old": "urgente", "new": null}}'::jsonb,
  'delete guarda los valores que tenía la fila'
);

-- Cambios de perfiles hechos por el admin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update public.profiles set role = 'logistica' where id = '00000000-0000-0000-0000-0000000000b4';
reset role;
select results_eq(
  $$ select actor_name, action, changes from public.audit_log
     where table_name = 'profiles' and record_id = '00000000-0000-0000-0000-0000000000b4'
       and action = 'update' $$,
  $$ values ('Ana Admin', 'update', '{"role": {"old": "ventas", "new": "logistica"}}'::jsonb) $$,
  'el cambio de rol queda registrado con el admin que lo hizo'
);

-- Lectura según el rol
set local role authenticated;
select ok(
  (select count(*) from public.audit_log) >= 5,
  'admin lee la auditoría'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select ok(
  (select count(*) from public.audit_log where table_name = 'prueba_auditoria') = 3,
  'ventas lee el historial de las entidades del negocio'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'profiles'),
  0,
  'ventas no lee los cambios de usuarios'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
select is((select count(*)::int from public.audit_log), 0, 'logística no lee el historial');

select throws_ok(
  $$ insert into public.audit_log (table_name, record_id, action) values ('x', '1', 'insert') $$,
  '42501',
  null,
  'un usuario no puede escribir en la auditoría'
);

reset role;
set local role anon;
select throws_ok(
  $$ select count(*) from public.audit_log $$,
  '42501',
  null,
  'un anónimo no lee la auditoría'
);

-- Nadie puede modificar ni borrar, ni siquiera el dueño de la tabla.
reset role;
select throws_ok(
  $$ update public.audit_log set actor_name = 'otro' $$,
  '42501',
  'El registro de auditoría no se puede modificar ni borrar',
  'nadie puede modificar la auditoría'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501',
  'El registro de auditoría no se puede modificar ni borrar',
  'nadie puede borrar la auditoría'
);
select throws_ok(
  $$ truncate public.audit_log $$,
  '42501',
  'El registro de auditoría no se puede modificar ni borrar',
  'nadie puede vaciar la auditoría'
);

select * from finish();
rollback;
