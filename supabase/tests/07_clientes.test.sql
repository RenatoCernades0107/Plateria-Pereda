begin;

select plan(17);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'admin@clientes.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000001a2', 'ventas@clientes.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000001a3', 'logistica@clientes.test', '{"role":"logistica"}', '{}');

-- Como ventas
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.clients (id, kind, first_name, last_name, document_type, document_number, phone, email)
     values ('00000000-0000-0000-0000-00000000c001', 'persona', 'Ana María', 'Pérez', 'dni', '45678912', '+51999888777', 'ana@correo.pe') $$,
  'ventas registra una persona'
);
select lives_ok(
  $$ insert into public.clients (id, kind, legal_name, document_type, document_number, phone)
     values ('00000000-0000-0000-0000-00000000c002', 'empresa', 'Joyería Andina S.A.C.', 'ruc', '20100047218', '+5112345678') $$,
  'ventas registra una empresa'
);
select is(
  (select display_name from public.clients where id = '00000000-0000-0000-0000-00000000c001'),
  'Ana María Pérez',
  'el nombre para mostrar de una persona son sus nombres y apellidos'
);
select is(
  (select created_by from public.clients where id = '00000000-0000-0000-0000-00000000c001'),
  '00000000-0000-0000-0000-0000000001a2'::uuid,
  'se guarda quién registró al cliente'
);
select throws_ok(
  $$ insert into public.clients (kind, first_name, last_name, document_type, document_number)
     values ('persona', 'Otra', 'Persona', 'dni', '45678912') $$,
  '23505', null, 'el documento es único por tipo'
);
select throws_ok(
  $$ insert into public.clients (kind, legal_name) values ('empresa', 'Sin RUC S.A.') $$,
  '23514', null, 'una empresa necesita RUC'
);
select throws_ok(
  $$ insert into public.clients (kind, first_name, document_type, document_number)
     values ('persona', 'Luis', 'ruc', '20131312955') $$,
  '23514', null, 'una persona no usa RUC'
);
select throws_ok(
  $$ insert into public.clients (kind, first_name, phone) values ('persona', 'Luis', '999888777') $$,
  '23514', null, 'el teléfono se guarda en formato E.164'
);
select throws_ok(
  $$ update public.clients set kind = 'empresa' where id = '00000000-0000-0000-0000-00000000c001' $$,
  '23514', null, 'un cliente no cambia de tipo'
);

-- Contactos
select lives_ok(
  $$ insert into public.contacts (id, client_id, first_name, last_name, position, phone)
     values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c002', 'Luis', 'Rojas', 'Gerente', '+51988777666') $$,
  'ventas agrega un contacto a una empresa'
);
select throws_ok(
  $$ insert into public.contacts (client_id, first_name)
     values ('00000000-0000-0000-0000-00000000c001', 'Contacto de persona') $$,
  '23514', 'Un contacto solo puede pertenecer a una empresa',
  'un contacto siempre pertenece a una empresa'
);
select throws_ok(
  $$ delete from public.clients where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'los clientes no se borran'
);

-- Logística lee pero no edita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a3","role":"authenticated"}', true);
select ok(
  (select count(*) from public.clients where id in ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002')) = 2
  and (select count(*) from public.contacts where id = '00000000-0000-0000-0000-00000000d001') = 1,
  'logística lee clientes y contactos'
);
select throws_ok(
  $$ insert into public.clients (kind, first_name) values ('persona', 'De logística') $$,
  '42501', null, 'logística no registra clientes'
);
update public.clients set notes = 'cambiado' where id = '00000000-0000-0000-0000-00000000c001';

reset role;
select is(
  (select notes from public.clients where id = '00000000-0000-0000-0000-00000000c001'),
  '',
  'logística no edita clientes'
);
select results_eq(
  $$ select actor_name, action from public.audit_log
     where table_name in ('clients', 'contacts')
       and record_id in ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000d001')
     order by id $$,
  $$ values ('Vera Ventas', 'insert'), ('Vera Ventas', 'insert'), ('Vera Ventas', 'insert') $$,
  'los clientes y contactos quedan auditados'
);

set local role anon;
select throws_ok($$ select * from public.clients $$, '42501', null, 'un anónimo no lee clientes');

select * from finish();
rollback;
