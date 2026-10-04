begin;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002a2', 'ventas@sync.test', '{"role":"ventas"}', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}', true);

insert into public.clients (id, kind, first_name, last_name, phone)
  values ('00000000-0000-0000-0000-00000000e001', 'persona', 'Ana', 'Pérez', '+51999888777');
insert into public.clients (id, kind, legal_name, document_type, document_number, city, region)
  values ('00000000-0000-0000-0000-00000000e002', 'empresa', 'Andina S.A.C.', 'ruc', '20100047218', 'Lima', 'LIM');
insert into public.contacts (id, client_id, first_name, phone)
  values ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e002', 'Luis', '+51988777666');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000e004', 'persona', 'Importada', 'gid://shopify/Customer/1');

reset role;
select results_eq(
  $$ select kind, entity_table, idempotency_key from public.shopify_sync_jobs
     where entity_id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e003')
     order by id $$,
  $$ values
       ('customer.create', 'clients', 'client:00000000-0000-0000-0000-00000000e001'),
       ('company.create', 'clients', 'client:00000000-0000-0000-0000-00000000e002'),
       ('contact.create', 'contacts', 'contact:00000000-0000-0000-0000-00000000e003') $$,
  'registrar una persona, una empresa o un contacto encola su alta en Shopify'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs where entity_id = '00000000-0000-0000-0000-00000000e004'),
  0,
  'un cliente que ya tiene id de Shopify (importado) no se encola'
);
select throws_ok(
  $$ insert into public.clients (kind, first_name, region) values ('persona', 'X', 'Lima') $$,
  '23514', null, 'la región es un código de 3 letras'
);

-- Estado de sincronización visible para ventas (que no lee el outbox)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}', true);
select is((select count(*)::int from public.shopify_sync_jobs), 0, 'ventas no lee el outbox');
select results_eq(
  $$ select entity_id, status from public.shopify_sync_status('clients',
       array['00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e004'])
     order by entity_id $$,
  $$ values ('00000000-0000-0000-0000-00000000e001', 'pending'), ('00000000-0000-0000-0000-00000000e002', 'pending') $$,
  'ventas ve el estado de sincronización de sus clientes'
);

reset role;
update public.shopify_sync_jobs set status = 'error', last_error = 'falló'
  where entity_id = '00000000-0000-0000-0000-00000000e001';
insert into public.shopify_sync_jobs (kind, entity_table, entity_id)
  values ('customer.update', 'clients', '00000000-0000-0000-0000-00000000e001');
set local role authenticated;
select is(
  (select status from public.shopify_sync_status('clients', array['00000000-0000-0000-0000-00000000e001'])),
  'pending',
  'muestra el job más reciente de cada registro'
);

reset role;
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000002a2';
set local role authenticated;
select is(
  (select count(*)::int from public.shopify_sync_status('clients', array['00000000-0000-0000-0000-00000000e001'])),
  0,
  'un usuario desactivado no ve estados'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.shopify_sync_status('clients', array['x']) $$,
  '42501', null, 'un anónimo no consulta estados'
);

select * from finish();
rollback;
