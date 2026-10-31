begin;

select plan(4);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000064a1', 'admin@vinculo.test', '{"role":"admin"}', '{}');

-- El que se queda no está en Shopify; el duplicado sí.
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000064c1', 'persona', 'Rosa', 'Vínculo');
insert into public.clients (id, kind, first_name, last_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000064c2', 'persona', 'ROSA', 'VINCULO', 'gid://shopify/Customer/6402');
-- Los dos en Shopify: cada uno conserva el suyo.
insert into public.clients (id, kind, first_name, last_name, shopify_customer_id) values
  ('00000000-0000-0000-0000-0000000064c3', 'persona', 'Eva', 'Doble', 'gid://shopify/Customer/6403'),
  ('00000000-0000-0000-0000-0000000064c4', 'persona', 'EVA', 'DOBLE', 'gid://shopify/Customer/6404');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a1","role":"authenticated"}', true);
select public.merge_clients('00000000-0000-0000-0000-0000000064c1', '00000000-0000-0000-0000-0000000064c2');
select public.merge_clients('00000000-0000-0000-0000-0000000064c3', '00000000-0000-0000-0000-0000000064c4');
reset role;

select is(
  (select shopify_customer_id from public.clients where id = '00000000-0000-0000-0000-0000000064c1'),
  'gid://shopify/Customer/6402',
  'el que se queda sin Shopify toma el vínculo del duplicado'
);
select is(
  (select shopify_customer_id from public.clients where id = '00000000-0000-0000-0000-0000000064c2'),
  null,
  'y el duplicado lo suelta'
);
select results_eq(
  $$ select id::text, shopify_customer_id from public.clients
     where id in ('00000000-0000-0000-0000-0000000064c3', '00000000-0000-0000-0000-0000000064c4')
     order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000064c3', 'gid://shopify/Customer/6403'),
            ('00000000-0000-0000-0000-0000000064c4', 'gid://shopify/Customer/6404') $$,
  'si los dos estaban en Shopify, cada uno conserva el suyo'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id like '00000000-0000-0000-0000-0000000064c%' and kind = 'customer.update'),
  0,
  'pasar el vínculo no envía nada a Shopify'
);

select * from finish();
rollback;
