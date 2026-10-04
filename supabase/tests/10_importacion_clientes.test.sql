begin;

select plan(12);

-- Persona registrada en el sistema, aún sin vincular (su alta está pendiente).
insert into public.clients (id, kind, first_name, last_name, email, phone)
  values ('00000000-0000-0000-0000-00000000a601', 'persona', 'Rosa', 'Local', 'rosa@import.test', '+51999600601');
-- Empresa con un contacto ya vinculado a Shopify.
insert into public.clients (id, kind, legal_name, document_type, document_number, region,
    shopify_company_id, shopify_company_location_id)
  values ('00000000-0000-0000-0000-00000000a602', 'empresa', 'Importación S.A.C.', 'ruc', '20999999602', 'LIM',
    'gid://shopify/Company/602', 'gid://shopify/CompanyLocation/602');
insert into public.contacts (id, client_id, first_name, shopify_customer_id, shopify_company_contact_id)
  values ('00000000-0000-0000-0000-00000000a603', '00000000-0000-0000-0000-00000000a602', 'Luis',
    'gid://shopify/Customer/603', 'gid://shopify/CompanyContact/603');

select is(
  public.import_shopify_customer('gid://shopify/Customer/601', 'Ana', 'Importada', 'ANA@import.test', '+51999600611', 'VIP', 'Ana'),
  'created', 'crea la persona nueva'
);
select results_eq(
  $$ select first_name, last_name, email, phone, notes from public.clients
     where shopify_customer_id = 'gid://shopify/Customer/601' $$,
  $$ values ('Ana', 'Importada', 'ana@import.test', '+51999600611', 'VIP') $$,
  'guarda los datos con el email en minúsculas'
);
select is(
  public.import_shopify_customer('gid://shopify/Customer/601', 'Ana', 'Importada', 'ana@import.test', '+51999600611', 'VIP', 'Ana'),
  'unchanged', 'volver a importarla no la duplica'
);
select is(
  (select count(*)::int from public.clients where shopify_customer_id = 'gid://shopify/Customer/601'),
  1, 'sigue habiendo una sola persona'
);
select is(
  public.import_shopify_customer('gid://shopify/Customer/601', '', '', 'ana.nueva@import.test', null, 'otra nota', 'ana.nueva'),
  'updated', 'un cambio en Shopify la actualiza'
);
select results_eq(
  $$ select first_name, last_name, email, phone, notes from public.clients
     where shopify_customer_id = 'gid://shopify/Customer/601' $$,
  $$ values ('Ana', 'Importada', 'ana.nueva@import.test', '+51999600611', 'VIP') $$,
  'sin nombres ni teléfono en Shopify conserva los del sistema; las notas no se pisan'
);

select is(
  public.import_shopify_customer('gid://shopify/Customer/604', 'Rosa', 'Shopify', 'otro@import.test', '+51999600601', '', 'Rosa'),
  'linked', 'vincula la persona del sistema con el mismo teléfono'
);
select results_eq(
  $$ select first_name, last_name, shopify_customer_id from public.clients
     where id = '00000000-0000-0000-0000-00000000a601' $$,
  $$ values ('Rosa', 'Local', 'gid://shopify/Customer/604') $$,
  'al vincular conserva los datos del sistema'
);

select is(
  public.import_shopify_customer('gid://shopify/Customer/603', 'Luis', 'Rojas', null, null, '', 'Luis'),
  'contact', 'el Customer de un contacto actualiza el contacto'
);
select is(
  (select last_name from public.contacts where id = '00000000-0000-0000-0000-00000000a603'),
  'Rojas', 'el contacto queda actualizado y no se crea una persona'
);

select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id in (select id::text from public.clients where shopify_customer_id like 'gid://shopify/Customer/60%')
      or entity_id = '00000000-0000-0000-0000-00000000a603'),
  1, 'nada de lo importado se devuelve a Shopify (solo queda el alta previa de Rosa)'
);

set local role authenticated;
select throws_ok(
  $$ select public.import_shopify_customer('gid://shopify/Customer/1', 'X', '', null, null, '', 'X') $$,
  '42501', null, 'los usuarios no llaman a la importación (solo el servidor)'
);

select * from finish();
rollback;
