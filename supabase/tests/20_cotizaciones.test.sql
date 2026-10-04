begin;

select plan(31);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000020a1', 'admin@cotizaciones.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000020a2', 'ventas@cotizaciones.test', '{"role":"ventas"}', '{"full_name":"Vera Cotiza"}'),
  ('00000000-0000-0000-0000-0000000020a3', 'logistica@cotizaciones.test', '{"role":"logistica"}', '{}');

insert into public.clients (id, kind, first_name, last_name, document_type, document_number, phone, email)
  values ('00000000-0000-0000-0000-0000000020c1', 'persona', 'Rosa', 'Cotizada', 'dni', '40200001', '+51999200001', 'rosa@cotiza.pe');
insert into public.clients (id, kind, legal_name, document_type, document_number, address)
  values ('00000000-0000-0000-0000-0000000020c2', 'empresa', 'Regalos Andinos S.A.C.', 'ruc', '20999999983', 'Av. Arequipa 123');
insert into public.contacts (id, client_id, first_name, last_name, phone)
  values ('00000000-0000-0000-0000-0000000020d1', '00000000-0000-0000-0000-0000000020c2', 'Marta', 'Compras', '+51999200002');

update public.settings set quote_validity_days = 20;

-- Como ventas
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a2","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.quotes (id, client_id) values ('00000000-0000-0000-0000-0000000020e1', '00000000-0000-0000-0000-0000000020c1') $$,
  'ventas crea una cotización'
);
select lives_ok(
  $$ insert into public.quotes (id, client_id, contact_id)
     values ('00000000-0000-0000-0000-0000000020e2', '00000000-0000-0000-0000-0000000020c2', '00000000-0000-0000-0000-0000000020d1') $$,
  'ventas crea una cotización para el contacto de una empresa'
);

select ok(
  (select code from public.quotes where id = '00000000-0000-0000-0000-0000000020e1') ~ '^COT-\d{6}$',
  'el código tiene el formato COT-000001'
);
select is(
  (select number from public.quotes where id = '00000000-0000-0000-0000-0000000020e2'),
  (select number + 1 from public.quotes where id = '00000000-0000-0000-0000-0000000020e1'),
  'el código es correlativo'
);
select throws_ok(
  $$ insert into public.quotes (number, client_id) values (1, '00000000-0000-0000-0000-0000000020c1') $$,
  '428C9', null, 'el correlativo no se escribe a mano'
);
select is(
  (select count(distinct code)::int from public.quotes), (select count(*)::int from public.quotes),
  'el código es único'
);
select is(
  (select status::text || '/' || validity_days from public.quotes where id = '00000000-0000-0000-0000-0000000020e1'),
  'borrador/20',
  'nace en borrador con la vigencia por defecto de la configuración'
);
select results_eq(
  $$ select client_name, client_document_number, client_phone, client_email, contact_name
     from public.quotes where id in ('00000000-0000-0000-0000-0000000020e1', '00000000-0000-0000-0000-0000000020e2')
     order by number $$,
  $$ values ('Rosa Cotizada', '40200001', '+51999200001', 'rosa@cotiza.pe', null::text),
            ('Regalos Andinos S.A.C.', '20999999983', null, null, 'Marta Compras') $$,
  'se copian los datos del cliente y del contacto'
);
select throws_ok(
  $$ insert into public.quotes (client_id, contact_id)
     values ('00000000-0000-0000-0000-0000000020c1', '00000000-0000-0000-0000-0000000020d1') $$,
  '23514', 'El contacto no pertenece al cliente de la cotización',
  'el contacto debe ser del cliente'
);

-- Líneas y totales
select lives_ok(
  $$ insert into public.quote_items (quote_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku, catalog_price, customization, quantity, unit_price)
     values ('00000000-0000-0000-0000-0000000020e1', 0, 'gid://shopify/Product/1', 'gid://shopify/ProductVariant/1', 'Anillo de plata', 'Talla 7', 'AN-7', 120.00, 'Grabado "R & J"', 2, 120.10) $$,
  'ventas agrega una línea de un producto de Shopify'
);
select lives_ok(
  $$ insert into public.quote_items (id, quote_id, position, title, quantity, unit_price, discount_type, discount_value)
     values ('00000000-0000-0000-0000-0000000020f2', '00000000-0000-0000-0000-0000000020e1', 1, 'Medalla con diseño libre', 3, 33.33, 'porcentaje', 10) $$,
  'ventas agrega una línea libre con descuento en %'
);
select results_eq(
  $$ select subtotal, discount_total, total from public.quotes where id = '00000000-0000-0000-0000-0000000020e1' $$,
  $$ values (340.19::numeric, 10.00::numeric, 330.19::numeric) $$,
  'los totales se recalculan al agregar líneas (10 % de 99.99 = 10.00)'
);
update public.quote_items set discount_type = 'monto', discount_value = 9.99
  where id = '00000000-0000-0000-0000-0000000020f2';
select results_eq(
  $$ select subtotal, discount_total, total from public.quotes where id = '00000000-0000-0000-0000-0000000020e1' $$,
  $$ values (340.19::numeric, 9.99::numeric, 330.20::numeric) $$,
  'los totales se recalculan al editar una línea'
);
delete from public.quote_items where id = '00000000-0000-0000-0000-0000000020f2';
select results_eq(
  $$ select subtotal, discount_total, total from public.quotes where id = '00000000-0000-0000-0000-0000000020e1' $$,
  $$ values (240.20::numeric, 0::numeric, 240.20::numeric) $$,
  'los totales se recalculan al quitar una línea'
);
select throws_ok(
  $$ insert into public.quote_items (quote_id, title, quantity, unit_price) values ('00000000-0000-0000-0000-0000000020e1', 'Cero', 0, 10) $$,
  '23514', null, 'la cantidad debe ser mayor que 0'
);
select throws_ok(
  $$ insert into public.quote_items (quote_id, title, quantity, unit_price) values ('00000000-0000-0000-0000-0000000020e1', 'Negativo', 1, -1) $$,
  '23514', null, 'el precio no puede ser negativo'
);
select throws_ok(
  $$ insert into public.quote_items (quote_id, title, quantity, unit_price, discount_type, discount_value)
     values ('00000000-0000-0000-0000-0000000020e1', 'Descuento alto', 1, 10, 'monto', 11) $$,
  '23514', null, 'el descuento no supera el subtotal de la línea'
);
select throws_ok(
  $$ update public.quotes set total = 1 where id = '00000000-0000-0000-0000-0000000020e1' $$,
  '42501', null, 'los totales no se escriben a mano'
);

-- Estados
select throws_ok(
  $$ update public.quotes set status = 'emitida' where id = '00000000-0000-0000-0000-0000000020e2' $$,
  '23514', 'La cotización necesita al menos una línea para emitirse',
  'no se emite sin líneas'
);
select throws_ok(
  $$ update public.quotes set status = 'aceptada' where id = '00000000-0000-0000-0000-0000000020e1' $$,
  '23514', null, 'un borrador no pasa directo a aceptada'
);
update public.clients set phone = '+51999200009' where id = '00000000-0000-0000-0000-0000000020c1';
update public.quotes set status = 'emitida' where id = '00000000-0000-0000-0000-0000000020e1';
select is(
  (select issue_date::text || '/' || valid_until::text || '/' || client_phone from public.quotes where id = '00000000-0000-0000-0000-0000000020e1'),
  (now() at time zone 'America/Lima')::date::text || '/' || ((now() at time zone 'America/Lima')::date + 20)::text || '/+51999200009',
  'al emitir se fija la fecha de emisión (Lima), la vigencia y los datos vigentes del cliente'
);
update public.clients set phone = '+51999200010' where id = '00000000-0000-0000-0000-0000000020c1';
select is(
  (select client_phone from public.quotes where id = '00000000-0000-0000-0000-0000000020e1'),
  '+51999200009',
  'una cotización emitida conserva los datos del cliente'
);
select throws_ok(
  $$ update public.quotes set notes = 'tarde' where id = '00000000-0000-0000-0000-0000000020e1' $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'una cotización emitida no se edita'
);
select throws_ok(
  $$ insert into public.quote_items (quote_id, title, quantity, unit_price) values ('00000000-0000-0000-0000-0000000020e1', 'Otra', 1, 1) $$,
  '23514', 'Solo se pueden cambiar las líneas de una cotización en borrador',
  'una cotización emitida no cambia sus líneas'
);
select is(
  (select public.effective_status(q) from public.quotes q where id = '00000000-0000-0000-0000-0000000020e1'),
  'emitida', 'una emitida vigente no está vencida'
);
select lives_ok(
  $$ update public.quotes set status = 'aceptada' where id = '00000000-0000-0000-0000-0000000020e1' $$,
  'una emitida se acepta'
);
select throws_ok(
  $$ delete from public.quotes where id = '00000000-0000-0000-0000-0000000020e1' $$,
  '42501', null, 'las cotizaciones no se borran'
);

-- Logística no ve el cotizador
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a3","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.quotes) + (select count(*)::int from public.quote_items),
  0, 'logística no lee cotizaciones ni líneas'
);
select throws_ok(
  $$ insert into public.quotes (client_id) values ('00000000-0000-0000-0000-0000000020c1') $$,
  '42501', null, 'logística no crea cotizaciones'
);

reset role;
-- Vencida: una emitida cuya vigencia ya pasó.
update public.quotes set issue_date = private.lima_today() - 21 where id = '00000000-0000-0000-0000-0000000020e1';
update public.quotes set status = 'emitida' where id = '00000000-0000-0000-0000-0000000020e1';
select is(
  (select public.effective_status(q) from public.quotes q where id = '00000000-0000-0000-0000-0000000020e1'),
  'vencida', 'una emitida con la vigencia vencida se muestra como vencida'
);

select results_eq(
  $$ select table_name, action, actor_name from public.audit_log
     where record_id = '00000000-0000-0000-0000-0000000020e1' and action = 'insert' $$,
  $$ values ('quotes', 'insert', 'Vera Cotiza') $$,
  'las cotizaciones quedan auditadas'
);

select * from finish();
rollback;
