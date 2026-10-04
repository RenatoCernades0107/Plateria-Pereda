begin;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a1', 'ventas@edicion.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000003a2', 'logistica@edicion.test', '{"role":"logistica"}', '{}');

-- Ya sincronizados con Shopify (como si los handlers hubieran guardado sus ids).
insert into public.clients (id, kind, first_name, last_name, phone, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000f001', 'persona', 'Ana', 'Edición', '+51999000111', 'gid://shopify/Customer/71');
insert into public.clients (id, kind, legal_name, document_type, document_number, city, region,
    shopify_company_id, shopify_company_location_id)
  values ('00000000-0000-0000-0000-00000000f002', 'empresa', 'Edición S.A.C.', 'ruc', '20999999991', 'Lima', 'LIM',
    'gid://shopify/Company/72', 'gid://shopify/CompanyLocation/73');
insert into public.contacts (id, client_id, first_name, shopify_customer_id, shopify_company_contact_id)
  values ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000f002', 'Luis',
    'gid://shopify/Customer/74', 'gid://shopify/CompanyContact/75');
-- Aún sin sincronizar.
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000f004', 'persona', 'Nueva Edición');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}', true);

update public.clients set phone = '+51999000222' where id = '00000000-0000-0000-0000-00000000f001';
update public.clients set phone = '+51999000333' where id = '00000000-0000-0000-0000-00000000f001';
update public.clients set city = 'Arequipa', region = 'ARE' where id = '00000000-0000-0000-0000-00000000f002';
update public.contacts set last_name = 'Rojas' where id = '00000000-0000-0000-0000-00000000f003';
update public.clients set notes = 'solo notas' where id in (
  '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f002');
update public.clients set first_name = 'Nueva' where id = '00000000-0000-0000-0000-00000000f004';

reset role;
select results_eq(
  $$ select kind, entity_table, entity_id from public.shopify_sync_jobs
     where entity_id like '00000000-0000-0000-0000-00000000f%' and kind like '%.update'
     order by id $$,
  $$ values
       ('customer.update', 'clients', '00000000-0000-0000-0000-00000000f001'),
       ('company.update', 'clients', '00000000-0000-0000-0000-00000000f002'),
       ('contact.update', 'contacts', '00000000-0000-0000-0000-00000000f003') $$,
  'editar datos sincronizados encola una sola actualización pendiente por registro'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id = '00000000-0000-0000-0000-00000000f004' and kind like '%.update'),
  0,
  'un cliente aún sin sincronizar no encola actualización (el alta lee los datos vigentes)'
);

-- Con la actualización ya en proceso, un nuevo cambio sí se encola.
update public.shopify_sync_jobs set status = 'processing'
  where entity_id = '00000000-0000-0000-0000-00000000f001' and kind = 'customer.update';
update public.clients set email = 'ana@edicion.pe' where id = '00000000-0000-0000-0000-00000000f001';
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id = '00000000-0000-0000-0000-00000000f001' and kind = 'customer.update'),
  2,
  'un cambio durante el envío anterior encola otra actualización'
);

-- Cambios que llegan desde Shopify (webhook customers/update).
delete from public.shopify_sync_jobs
  where entity_id like '00000000-0000-0000-0000-00000000f%' and kind like '%.update';
select is(
  public.apply_shopify_customer_update('gid://shopify/Customer/71', 'Ana María', 'Edición', 'ANA.M@edicion.pe', '+51999000444'),
  1,
  'actualiza la persona vinculada'
);
select results_eq(
  $$ select first_name, email, phone from public.clients where id = '00000000-0000-0000-0000-00000000f001' $$,
  $$ values ('Ana María', 'ana.m@edicion.pe', '+51999000444') $$,
  'guarda nombres, email en minúsculas y teléfono de Shopify'
);
select is(
  public.apply_shopify_customer_update('gid://shopify/Customer/74', 'Luis', 'Rojas Díaz', 'correo-invalido', '999'),
  1,
  'actualiza el contacto vinculado'
);
select results_eq(
  $$ select last_name, email, phone from public.contacts where id = '00000000-0000-0000-0000-00000000f003' $$,
  $$ values ('Rojas Díaz', null::text, null::text) $$,
  'ignora el email y el teléfono que no cumplen las reglas'
);
select is(
  public.apply_shopify_customer_update('gid://shopify/Customer/71', '', 'Edición', null, null),
  0,
  'un nombre vacío o datos iguales no cambian nada'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id like '00000000-0000-0000-0000-00000000f%' and kind like '%.update'),
  0,
  'los cambios de Shopify no se devuelven a Shopify'
);
select is(
  current_setting('app.sync_origin', true),
  '',
  'el origen se limpia al terminar'
);

-- Listado
select results_eq(
  $$ select display_name, sync_status, total_count from public.list_clients(p_query => 'edición')
     where display_name in ('Ana María Edición', 'Edición S.A.C.') order by display_name $$,
  $$ values ('Ana María Edición', 'ok', 2::bigint), ('Edición S.A.C.', 'ok', 2::bigint) $$,
  'busca por nombre; con id de Shopify y sin jobs cuenta como sincronizado'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003a2","role":"authenticated"}', true);
select results_eq(
  $$ select display_name from public.list_clients(p_query => '20999999991') $$,
  $$ values ('Edición S.A.C.') $$,
  'logística también lista y busca por documento'
);
select results_eq(
  $$ select display_name from public.list_clients(p_query => '999 000 444', p_kind => 'persona') $$,
  $$ values ('Ana María Edición') $$,
  'busca por dígitos del teléfono y filtra por tipo'
);
select results_eq(
  $$ select display_name, sync_status from public.list_clients(p_query => 'Nueva', p_sync => 'pending') $$,
  $$ values ('Nueva', 'pending') $$,
  'filtra por estado de sincronización'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.list_clients() $$,
  '42501', null, 'un anónimo no lista clientes'
);

select * from finish();
rollback;
