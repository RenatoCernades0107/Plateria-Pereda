begin;

select plan(18);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000063a1', 'admin@fusion.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000063a2', 'ventas@fusion.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000063a3', 'logistica@fusion.test', '{"role":"logistica"}', '{}');

-- La misma persona dos veces (como MARIA PIA TOMATIS), cada una con su ficha de Shopify.
insert into public.clients (id, kind, first_name, last_name, notes, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000063c1', 'persona', 'María Pía', 'Tomatis', 'Clienta frecuente',
    'gid://shopify/Customer/6301');
insert into public.clients (id, kind, first_name, last_name, phone, email, document_type, document_number,
    shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000063c2', 'persona', 'MARIA PIA', 'TOMATIS', '+51999497325',
    'mpt@fusion.test', 'dni', '63000001', 'gid://shopify/Customer/6302');
insert into public.clients (id, kind, legal_name, document_type, document_number, city, region)
  values ('00000000-0000-0000-0000-0000000063c3', 'empresa', 'Fusión S.A.C.', 'ruc', '20630000001', 'Lima', 'LIM');
insert into public.clients (id, kind, first_name, last_name, active)
  values ('00000000-0000-0000-0000-0000000063c4', 'persona', 'Maria Pia', 'Tomatis', false);

-- Lo del duplicado: dos guías, una cotización ya emitida y una de WhatsApp.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000063d1', '00000000-0000-0000-0000-0000000063c2', 'contado'),
  ('00000000-0000-0000-0000-0000000063d2', '00000000-0000-0000-0000-0000000063c2', 'contado');
insert into public.quotes (id, client_id, status, issue_date)
  values ('00000000-0000-0000-0000-0000000063e1', '00000000-0000-0000-0000-0000000063c2', 'emitida', current_date);
insert into public.whatsapp_quotes (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-0000000063f1', '00000000-0000-0000-0000-0000000063c2', 'contado');

set local role authenticated;

-- 1. Clientes parecidos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a2","role":"authenticated"}', true);

select results_eq(
  $$ select id, same_name, same_document, same_phone, same_email
     from public.similar_clients('  maría   PIA tomatis ', '', '', '') order by id $$,
  $$ values
       ('00000000-0000-0000-0000-0000000063c1'::uuid, true, false, false, false),
       ('00000000-0000-0000-0000-0000000063c2'::uuid, true, false, false, false) $$,
  'el mismo nombre coincide sin importar mayúsculas, tildes ni espacios (solo activos)'
);
select results_eq(
  $$ select id, same_name, same_document, same_phone, same_email
     from public.similar_clients('Otra Persona', '63000001', '+51999497325', 'MPT@fusion.test') $$,
  $$ values ('00000000-0000-0000-0000-0000000063c2'::uuid, false, true, true, true) $$,
  'coincide por documento, teléfono y email'
);
select is(
  (select count(*)::int from public.similar_clients('María Pía Tomatis', '', '', '',
    '00000000-0000-0000-0000-0000000063c1')),
  1,
  'excluye al propio cliente'
);
select is(
  (select count(*)::int from public.similar_clients('Nadie Así', '', '', '')),
  0,
  'sin coincidencias no devuelve nada'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a3","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.similar_clients('María Pía Tomatis', '', '', '')),
  0,
  'logística no ve clientes'
);

-- 2. Fusión.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.merge_clients('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063c2') $$,
  '42501', 'Solo el administrador puede fusionar clientes',
  'ventas no fusiona'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.merge_clients('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063c1') $$,
  '23514', 'Elige dos clientes distintos',
  'no se fusiona consigo mismo'
);
select throws_ok(
  $$ select public.merge_clients('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063c3') $$,
  '23514', 'Por ahora solo se pueden fusionar personas',
  'no se fusiona una empresa'
);

select is(
  public.merge_clients('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063c2'),
  '{"restorations": 2, "quotes": 1, "whatsappQuotes": 1}'::jsonb,
  'devuelve cuánto pasó al cliente que se queda'
);

reset role;
select is(
  (select count(*)::int from public.restorations where client_id = '00000000-0000-0000-0000-0000000063c1'),
  2,
  'las guías pasan al cliente que se queda'
);
select is(
  (select client_id from public.quotes where id = '00000000-0000-0000-0000-0000000063e1'),
  '00000000-0000-0000-0000-0000000063c1'::uuid,
  'también la cotización ya emitida'
);
select is(
  (select client_id from public.whatsapp_quotes where id = '00000000-0000-0000-0000-0000000063f1'),
  '00000000-0000-0000-0000-0000000063c1'::uuid,
  'y la cotización de WhatsApp'
);
select results_eq(
  $$ select active, merged_into, document_number from public.clients
     where id = '00000000-0000-0000-0000-0000000063c2' $$,
  $$ values (false, '00000000-0000-0000-0000-0000000063c1'::uuid, null::text) $$,
  'el duplicado queda desactivado, apuntando al que se queda y sin documento'
);
select results_eq(
  $$ select document_type::text, document_number, phone from public.clients
     where id = '00000000-0000-0000-0000-0000000063c1' $$,
  $$ values ('dni', '63000001', null::text) $$,
  'el que se queda toma el documento, pero no el teléfono'
);
select matches(
  (select notes from public.clients where id = '00000000-0000-0000-0000-0000000063c1'),
  '^Clienta frecuente\nFusionado con MARIA PIA TOMATIS el \d{2}/\d{2}/\d{4} \(tel\. \+51999497325, mpt@fusion\.test\)\.$',
  'el teléfono y el email del duplicado quedan en las notas'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where entity_id in ('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063c2')
     and kind = 'customer.update'),
  0,
  'la fusión no envía nada a Shopify'
);

set local role authenticated;
select throws_ok(
  $$ select public.merge_clients('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063c2') $$,
  '23514', 'Uno de los clientes ya se fusionó con otro',
  'un duplicado no se fusiona dos veces'
);

-- Fuera de la fusión, una cotización emitida sigue sin cambiar de cliente.
reset role;
select throws_ok(
  $$ update public.quotes set client_id = '00000000-0000-0000-0000-0000000063c4'
     where id = '00000000-0000-0000-0000-0000000063e1' $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'el cambio de cliente de una cotización emitida sigue bloqueado'
);

select * from finish();
rollback;
