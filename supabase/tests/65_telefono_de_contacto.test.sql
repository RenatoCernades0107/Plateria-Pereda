begin;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000065a1', 'admin@contacto.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000065a2', 'ventas@contacto.test', '{"role":"ventas"}', '{}');

-- La hija tiene el número (y su ficha de Shopify); la mamá lo usa como teléfono de contacto.
insert into public.clients (id, kind, first_name, last_name, phone, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000065c1', 'persona', 'Lucía', 'Hija', '+51999650001',
    'gid://shopify/Customer/6501');
insert into public.clients (id, kind, first_name, last_name, contact_phone, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000065c2', 'persona', 'Rosa', 'Mamá', '+51999650001',
    'gid://shopify/Customer/6502');

-- 1. Reglas de la columna.
select throws_ok(
  $$ insert into public.clients (kind, first_name, phone, contact_phone)
     values ('persona', 'Doble', '+51999650002', '+51999650003') $$,
  '23514', null,
  'no se guardan teléfono propio y de contacto a la vez'
);
select throws_ok(
  $$ insert into public.clients (kind, legal_name, document_type, document_number, contact_phone)
     values ('empresa', 'Contacto S.A.C.', 'ruc', '20650000001', '+51999650004') $$,
  '23514', null,
  'una empresa no tiene teléfono de contacto'
);
select throws_ok(
  $$ insert into public.clients (kind, first_name, contact_phone) values ('persona', 'Mal', '999') $$,
  '23514', null,
  'el teléfono de contacto va en E.164'
);
select lives_ok(
  $$ insert into public.clients (kind, first_name, contact_phone)
     values ('persona', 'Tía', '+51999650001') $$,
  'el teléfono de contacto no es único'
);

-- 2. No va a Shopify.
delete from public.shopify_sync_jobs where entity_id = '00000000-0000-0000-0000-0000000065c2';
update public.clients set contact_phone = '+51999650005' where id = '00000000-0000-0000-0000-0000000065c2';
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id = '00000000-0000-0000-0000-0000000065c2'),
  0,
  'cambiar el teléfono de contacto no encola nada para Shopify'
);
update public.clients set contact_phone = '+51999650001' where id = '00000000-0000-0000-0000-0000000065c2';

-- 3. Un teléfono que llega de Shopify no pisa el teléfono de contacto.
select lives_ok(
  $$ select public.apply_shopify_customer_update('gid://shopify/Customer/6502', 'Rosa', 'Mamá', null, '+51999650009') $$,
  'llega un teléfono de Shopify para quien usa teléfono de contacto'
);
select results_eq(
  $$ select phone, contact_phone from public.clients where id = '00000000-0000-0000-0000-0000000065c2' $$,
  $$ values (null::text, '+51999650001'::text) $$,
  'se conserva el teléfono de contacto'
);
select is(
  public.apply_shopify_customer_update('gid://shopify/Customer/6501', 'Lucía', 'Hija', null, '+51999650010'),
  1,
  'a quien no usa teléfono de contacto sí se le actualiza'
);
update public.clients set phone = '+51999650001' where id = '00000000-0000-0000-0000-0000000065c1';

-- 4. La cotización guarda el teléfono que tenga.
insert into public.quotes (id, client_id)
  values ('00000000-0000-0000-0000-0000000065e1', '00000000-0000-0000-0000-0000000065c2');
select is(
  (select client_phone from public.quotes where id = '00000000-0000-0000-0000-0000000065e1'),
  '+51999650001',
  'la cotización copia el teléfono de contacto'
);

-- 5. Mensaje de cotización (logística) y clientes parecidos.
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-0000000065d1', '00000000-0000-0000-0000-0000000065c2', 'contado');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000065a2","role":"authenticated"}', true);

select is(
  (select client_phone from public.restoration_quote_message_data('00000000-0000-0000-0000-0000000065d1')),
  '+51999650001',
  'el mensaje de cotización usa el teléfono de contacto'
);
select results_eq(
  $$ select id, phone, same_phone, uses_contact_phone
     from public.similar_clients('Otra', '', '+51999650001', '')
     where id in ('00000000-0000-0000-0000-0000000065c1', '00000000-0000-0000-0000-0000000065c2')
     order by id $$,
  $$ values
       ('00000000-0000-0000-0000-0000000065c1'::uuid, '+51999650001'::text, true, false),
       ('00000000-0000-0000-0000-0000000065c2'::uuid, '+51999650001'::text, true, true) $$,
  'el mismo número como teléfono propio o de contacto cuenta como «mismo teléfono»'
);
select is(
  (select count(*)::int from public.list_clients('999650001')
   where id = '00000000-0000-0000-0000-0000000065c2'),
  1,
  'el listado busca también por el teléfono de contacto'
);
select is(
  (select phone from public.list_clients('Rosa Mamá') limit 1),
  '+51999650001',
  'el listado muestra el teléfono de contacto'
);

-- 6. Fusión: quien se queda sin teléfono hereda el del duplicado como de contacto.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000065a1","role":"authenticated"}', true);
reset role;
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000065c3', 'persona', 'Rosa', 'Mamá');
set local role authenticated;
select lives_ok(
  $$ select public.merge_clients('00000000-0000-0000-0000-0000000065c3', '00000000-0000-0000-0000-0000000065c2') $$,
  'fusiona'
);
reset role;
select results_eq(
  $$ select phone, contact_phone from public.clients where id = '00000000-0000-0000-0000-0000000065c3' $$,
  $$ values (null::text, '+51999650001'::text) $$,
  'el que se queda recibe el teléfono como teléfono de contacto (no va a Shopify)'
);

select * from finish();
rollback;
