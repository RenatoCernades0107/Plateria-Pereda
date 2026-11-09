begin;

select plan(22);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000071a1', 'admin@convertir.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000071a2', 'ventas@convertir.test', '{"role":"ventas"}', '{}');

-- c1: persona ya en Shopify, con una guía y una cotización. c2: persona aún no
-- sincronizada (su alta queda pendiente). c3: empresa. c4: inactiva. c5: sincronizándose.
insert into public.clients (id, kind, first_name, last_name, phone, email, document_type,
    document_number, notes, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000071c1', 'persona', 'Rosa', 'Pereda', '+51999710001',
    'rosa@convertir.test', 'dni', '71000001', 'Clienta frecuente', 'gid://shopify/Customer/7101');
insert into public.clients (id, kind, first_name, last_name, contact_phone)
  values ('00000000-0000-0000-0000-0000000071c2', 'persona', 'Luis', 'Quispe', '+51999710002');
insert into public.clients (id, kind, legal_name, document_type, document_number, city, region)
  values ('00000000-0000-0000-0000-0000000071c3', 'empresa', 'Ya Empresa S.A.C.', 'ruc', '20710000003', 'Lima', 'LIM');
insert into public.clients (id, kind, first_name, active, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000071c4', 'persona', 'Inactiva', false, 'gid://shopify/Customer/7104');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000071c5', 'persona', 'Procesando');
update public.shopify_sync_jobs set status = 'processing', locked_at = now()
  where entity_id = '00000000-0000-0000-0000-0000000071c5';

insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000071d1', '00000000-0000-0000-0000-0000000071c1', 'contado');
insert into public.quotes (id, client_id, status, issue_date)
  values ('00000000-0000-0000-0000-0000000071e1', '00000000-0000-0000-0000-0000000071c1', 'emitida', current_date);

set local role authenticated;

-- 1. Permisos y validaciones.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000071a2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000071c1',
       'Pereda S.A.C.', '20710000001', '+51999710001', '', 'Lima', 'LIM', '', true) $$,
  '42501', 'Solo el administrador puede convertir clientes en empresa',
  'ventas no convierte'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000071a1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000071c3',
       'Otra S.A.C.', '20710000009', '+51999710009', '', 'Lima', 'LIM', '', true) $$,
  '23514', 'El cliente ya es una empresa',
  'una empresa no se convierte'
);
select throws_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000071c4',
       'Inactiva S.A.C.', '20710000004', '+51999710004', '', 'Lima', 'LIM', '', true) $$,
  '23514', 'Solo se pueden convertir clientes activos',
  'un cliente inactivo no se convierte'
);
select throws_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000071c5',
       'Procesando S.A.C.', '20710000005', '+51999710005', '', 'Lima', 'LIM', '', true) $$,
  '23514', 'El cliente se está sincronizando con Shopify; inténtalo en unos segundos',
  'espera a que termine el alta que se está enviando'
);
select throws_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000071c1',
       'Duplicada S.A.C.', '20710000003', '+51999710001', '', 'Lima', 'LIM', '', true) $$,
  '23505', null,
  'el RUC no se repite'
);
select throws_ok(
  $$ update public.clients set kind = 'empresa', legal_name = 'X', document_type = 'ruc',
       document_number = '20710000008', shopify_customer_id = null
     where id = '00000000-0000-0000-0000-0000000071c1' $$,
  '23514', 'No se puede cambiar el tipo de cliente',
  'fuera de la conversión el tipo sigue sin cambiar'
);

-- 2. Persona en Shopify que se queda como contacto.
select is(
  public.convert_client_to_company('00000000-0000-0000-0000-0000000071c1',
    'Pereda S.A.C.', '20710000001', '+51999710001', '', 'Arequipa', 'ARE', 'Clienta frecuente',
    true, 'ventas@pereda.test') - 'contactId',
  '{"hadShopifyCustomer": true}'::jsonb,
  'convierte y avisa que tenía cliente en Shopify'
);
select results_eq(
  $$ select kind::text, display_name, document_type::text, document_number, phone, email, city,
       region, shopify_customer_id, first_name, last_name
     from public.clients where id = '00000000-0000-0000-0000-0000000071c1' $$,
  $$ values ('empresa', 'Pereda S.A.C.', 'ruc', '20710000001', '+51999710001',
       'ventas@pereda.test', 'Arequipa', 'ARE', null::text, '', '') $$,
  'queda como empresa con los datos nuevos y sin el Customer'
);
select ok(
  (select notes like 'Clienta frecuente' || E'\n' || 'Convertido de persona (Rosa Pereda) a empresa el %'
   from public.clients where id = '00000000-0000-0000-0000-0000000071c1'),
  'las notas dicen de quién viene'
);
select results_eq(
  $$ select first_name, last_name, document_type::text, document_number, phone, email,
       shopify_customer_id, shopify_company_contact_id
     from public.contacts where client_id = '00000000-0000-0000-0000-0000000071c1' $$,
  $$ values ('Rosa', 'Pereda', 'dni', '71000001', '+51999710001', 'rosa@convertir.test',
       'gid://shopify/Customer/7101', null::text) $$,
  'la persona queda como contacto con su Customer de Shopify'
);
select is(
  (select client_id from public.restorations where id = '00000000-0000-0000-0000-0000000071d1'),
  '00000000-0000-0000-0000-0000000071c1'::uuid,
  'la guía sigue con el cliente'
);
select is(
  (select client_id from public.quotes where id = '00000000-0000-0000-0000-0000000071e1'),
  '00000000-0000-0000-0000-0000000071c1'::uuid,
  'la cotización sigue con el cliente'
);

reset role;
select results_eq(
  $$ select kind, entity_table, status from public.shopify_sync_jobs
     where entity_id = '00000000-0000-0000-0000-0000000071c1'
        or entity_id in (select id::text from public.contacts
                         where client_id = '00000000-0000-0000-0000-0000000071c1')
     order by id $$,
  $$ values ('company.create', 'clients', 'pending'), ('contact.create', 'contacts', 'pending') $$,
  'encola el alta de la Company y, después, la asignación del contacto'
);
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'clients' and record_id = '00000000-0000-0000-0000-0000000071c1'
     and action = 'update' and changes -> 'kind' = '{"old": "persona", "new": "empresa"}'::jsonb),
  1,
  'el cambio de tipo queda en la auditoría'
);

-- 3. Persona aún no sincronizada que no se queda como contacto.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000071a1","role":"authenticated"}', true);
select is(
  public.convert_client_to_company('00000000-0000-0000-0000-0000000071c2',
    'Quispe E.I.R.L.', '10710000002', '+51999710002', '', 'Lima', 'LIM', '', false),
  '{"contactId": null, "hadShopifyCustomer": false}'::jsonb,
  'convierte sin contacto'
);
select is(
  (select contact_phone from public.clients where id = '00000000-0000-0000-0000-0000000071c2'),
  null,
  'una empresa no tiene teléfono de contacto'
);
select is(
  (select count(*)::int from public.contacts where client_id = '00000000-0000-0000-0000-0000000071c2'),
  0,
  'no crea contacto'
);

reset role;
select results_eq(
  $$ select kind, status, result from public.shopify_sync_jobs
     where entity_id = '00000000-0000-0000-0000-0000000071c2' order by id $$,
  $$ values ('customer.create', 'ok', '{"skipped": true, "reason": "convertido en empresa"}'::jsonb),
            ('company.create', 'pending', null::jsonb) $$,
  'el alta de la persona se omite y se encola la de la empresa'
);

-- 4. Una sola vez.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000071a1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.convert_client_to_company('00000000-0000-0000-0000-0000000071c2',
       'Otra vez S.A.C.', '20710000007', '+51999710002', '', 'Lima', 'LIM', '', true) $$,
  '23514', 'El cliente ya es una empresa',
  'no se convierte dos veces'
);

-- 5. Acceso a la función.
reset role;
select ok(
  not has_function_privilege('anon',
    'public.convert_client_to_company(uuid, text, text, text, text, text, text, text, boolean, text)',
    'execute'),
  'anon no la ejecuta'
);
select ok(
  has_function_privilege('authenticated',
    'public.convert_client_to_company(uuid, text, text, text, text, text, text, text, boolean, text)',
    'execute'),
  'los usuarios la ejecutan (la función exige admin)'
);
select ok(
  (select prosecdef from pg_proc where proname = 'convert_client_to_company'),
  'corre como security definer'
);

select * from finish();
rollback;
