begin;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000072a1', 'admin@borrar.test', '{"role":"admin"}', '{}');

-- c1: persona en Shopify que no se queda de contacto. c2: se queda. c3: aún no estaba en
-- Shopify y no se queda.
insert into public.clients (id, kind, first_name, last_name, email, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000072c1', 'persona', 'Rosa', 'Pereda', 'rosa@borrar.test',
    'gid://shopify/Customer/7201');
insert into public.clients (id, kind, first_name, last_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000072c2', 'persona', 'Luis', 'Quispe',
    'gid://shopify/Customer/7202');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000072c3', 'persona', 'Sin Shopify');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000072a1","role":"authenticated"}', true);

select is(
  public.convert_client_to_company('00000000-0000-0000-0000-0000000072c1',
    'Pereda S.A.C.', '20720000001', '+51999720001', '', 'Lima', 'LIM', '', false),
  '{"contactId": null, "hadShopifyCustomer": true}'::jsonb,
  'convierte sin conservar a la persona'
);
select results_eq(
  $$ select shopify_customer_id, client_id from public.unlinked_shopify_customers $$,
  $$ values ('gid://shopify/Customer/7201', '00000000-0000-0000-0000-0000000072c1'::uuid) $$,
  'recuerda su Customer de Shopify (solo admin lo ve)'
);
select lives_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000072c2',
       'Quispe S.A.C.', '20720000002', '+51999720002', '', 'Lima', 'LIM', '', true) $$,
  'convierte conservándola como contacto'
);
select lives_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000072c3',
       'Sin Shopify S.A.C.', '20720000003', '+51999720003', '', 'Lima', 'LIM', '', false) $$,
  'convierte a quien aún no estaba en Shopify'
);

reset role;
select results_eq(
  $$ select kind, payload from public.shopify_sync_jobs
     where entity_id = '00000000-0000-0000-0000-0000000072c1' order by id $$,
  $$ values ('company.create', '{}'::jsonb),
            ('customer.delete', '{"customerId": "gid://shopify/Customer/7201"}'::jsonb) $$,
  'encola la Company y después el borrado de su Customer'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where kind = 'customer.delete'
     and entity_id in ('00000000-0000-0000-0000-0000000072c2', '00000000-0000-0000-0000-0000000072c3')),
  0,
  'sin borrado si se queda de contacto o si no tenía Customer'
);
select is(
  (select count(*)::int from public.unlinked_shopify_customers),
  1,
  'solo se recuerda el Customer que quedó sin vínculo'
);

-- La importación lo ignora: no vuelve como persona.
select is(
  public.import_shopify_customer('gid://shopify/Customer/7201', 'Rosa', 'Pereda',
    'rosa@borrar.test', '', '', 'Rosa'),
  'ignored',
  'la importación ignora ese Customer'
);
select is(
  (select count(*)::int from public.clients where shopify_customer_id = 'gid://shopify/Customer/7201'),
  0,
  'y no crea una persona con él'
);
select is(
  public.import_shopify_customer('gid://shopify/Customer/7299', 'Otra', 'Persona', '', '', '', 'Otra'),
  'created',
  'los demás Customers se importan como siempre'
);

-- La persona convertida no vuelve a aparecer con su email.
select ok(
  not exists (
    select 1 from public.clients where email = 'rosa@borrar.test' and kind = 'persona'
  ),
  'la persona convertida no reaparece'
);
select ok(
  not has_table_privilege('authenticated', 'public.unlinked_shopify_customers', 'insert'),
  'los usuarios no escriben en la tabla'
);

select * from finish();
rollback;
