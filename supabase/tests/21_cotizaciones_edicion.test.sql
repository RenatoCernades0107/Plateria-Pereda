begin;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000021a2', 'ventas@cotizaciones-edicion.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000021a3', 'logistica@cotizaciones-edicion.test', '{"role":"logistica"}', '{}');

insert into public.clients (id, kind, first_name, last_name, phone)
  values ('00000000-0000-0000-0000-0000000021c1', 'persona', 'Elsa', 'Editada', '+51999210001');
insert into public.clients (id, kind, legal_name, document_type, document_number)
  values ('00000000-0000-0000-0000-0000000021c2', 'empresa', 'Joyas del Sur S.A.C.', 'ruc', '20999999983');
insert into public.contacts (id, client_id, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000021d1', '00000000-0000-0000-0000-0000000021c2', 'Ciro', 'Compras');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000021a2","role":"authenticated"}', true);

select throws_ok(
  $$ select public.save_quote(null, '{"client_id":"00000000-0000-0000-0000-0000000021c1"}', '[]') $$,
  '23514', 'La cotización necesita al menos una línea',
  'no se guarda sin líneas'
);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into ids select 'q1', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000021c1","validity_days":10,"notes":"Entrega en 15 días","terms":"50% adelanto"}',
  '[{"id":"00000000-0000-0000-0000-0000000021f1","shopify_product_id":"gid://shopify/Product/1004","shopify_variant_id":"gid://shopify/ProductVariant/2006","title":"Anillo","variant_title":"Talla 8","sku":"ANI-950-08","catalog_price":"165.50","customization":"Grabado","quantity":2,"unit_price":"165.50"},
    {"id":"00000000-0000-0000-0000-0000000021f2","title":"Medalla libre","quantity":3,"unit_price":"40.00","discount_type":"monto","discount_value":"10.00"}]'
);

select results_eq(
  $$ select status::text, validity_days, notes, terms, subtotal, discount_total, total, client_name
     from public.quotes where id = (select id from ids where name = 'q1') $$,
  $$ values ('borrador', 10, 'Entrega en 15 días', '50% adelanto', 451.00::numeric, 10.00::numeric, 441.00::numeric, 'Elsa Editada') $$,
  'crea la cotización con sus datos y los totales de sus líneas'
);
select results_eq(
  $$ select position::int, title, sku from public.quote_items
     where quote_id = (select id from ids where name = 'q1') order by position $$,
  $$ values (0, 'Anillo', 'ANI-950-08'), (1, 'Medalla libre', null) $$,
  'las líneas quedan en el orden enviado'
);

-- Editar: se quita una línea, se cambia otra y se agrega una nueva, en otro orden.
select lives_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q1'),
       '{"client_id":"00000000-0000-0000-0000-0000000021c2","contact_id":"00000000-0000-0000-0000-0000000021d1","validity_days":30,"notes":"","terms":""}',
       '[{"id":"00000000-0000-0000-0000-0000000021f3","title":"Llavero","quantity":10,"unit_price":"5.00"},
         {"id":"00000000-0000-0000-0000-0000000021f2","title":"Medalla libre","quantity":1,"unit_price":"40.00","discount_type":"porcentaje","discount_value":"50"}]'
     ) $$,
  'edita el borrador'
);
select results_eq(
  $$ select id::text, position::int, quantity from public.quote_items
     where quote_id = (select id from ids where name = 'q1') order by position $$,
  $$ values ('00000000-0000-0000-0000-0000000021f3', 0, 10), ('00000000-0000-0000-0000-0000000021f2', 1, 1) $$,
  'deja exactamente las líneas enviadas y conserva el id de las existentes'
);
select results_eq(
  $$ select client_name, contact_name, validity_days, total from public.quotes
     where id = (select id from ids where name = 'q1') $$,
  $$ values ('Joyas del Sur S.A.C.', 'Ciro Compras', 30, 70.00::numeric) $$,
  'cambia el cliente, el contacto y recalcula el total'
);

-- Otra cotización no puede apropiarse de una línea ajena.
insert into ids select 'q2', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000021c1"}',
  '[{"id":"00000000-0000-0000-0000-0000000021f9","title":"Aretes","quantity":1,"unit_price":"80.00"}]'
);
select throws_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q2'),
       '{"client_id":"00000000-0000-0000-0000-0000000021c1"}',
       '[{"id":"00000000-0000-0000-0000-0000000021f3","title":"Robada","quantity":1,"unit_price":"1.00"}]'
     ) $$,
  '23514', 'Una línea pertenece a otra cotización',
  'no toma líneas de otra cotización'
);
select is(
  (select title from public.quote_items where id = '00000000-0000-0000-0000-0000000021f3'),
  'Llavero',
  'la línea ajena queda igual'
);

-- Emitida: ya no se edita, pero sí se duplica.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q1');
select throws_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q1'),
       '{"client_id":"00000000-0000-0000-0000-0000000021c2"}',
       '[{"id":"00000000-0000-0000-0000-0000000021f3","title":"Llavero","quantity":10,"unit_price":"5.00"}]'
     ) $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'una emitida no se edita'
);
select throws_ok(
  $$ select public.save_quote('00000000-0000-0000-0000-000000000000', '{}', '[{"title":"x","quantity":1,"unit_price":"1"}]') $$,
  'P0002', 'La cotización no existe',
  'avisa si la cotización no existe'
);

insert into ids select 'copia', public.duplicate_quote((select id from ids where name = 'q1'));
select results_eq(
  $$ select status::text, client_id::text, contact_id::text, validity_days, total, duplicated_from = (select id from ids where name = 'q1'), issue_date is null
     from public.quotes where id = (select id from ids where name = 'copia') $$,
  $$ values ('borrador', '00000000-0000-0000-0000-0000000021c2', '00000000-0000-0000-0000-0000000021d1', 30, 70.00::numeric, true, true) $$,
  'la copia es un borrador nuevo con el mismo cliente, vigencia y total'
);
select results_eq(
  $$ select title, quantity, discount_type from public.quote_items
     where quote_id = (select id from ids where name = 'copia') order by position $$,
  $$ values ('Llavero', 10, null::text), ('Medalla libre', 1, 'porcentaje') $$,
  'la copia tiene las mismas líneas'
);
select isnt(
  (select code from public.quotes where id = (select id from ids where name = 'copia')),
  (select code from public.quotes where id = (select id from ids where name = 'q1')),
  'la copia tiene su propio código'
);

-- Logística no usa el cotizador.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000021a3","role":"authenticated"}', true);
select throws_ok(
  $$ select public.save_quote(null, '{"client_id":"00000000-0000-0000-0000-0000000021c1"}', '[{"title":"x","quantity":1,"unit_price":"1"}]') $$,
  '42501', null,
  'logística no guarda cotizaciones'
);
select throws_ok(
  $$ select public.duplicate_quote((select id from ids where name = 'q1')) $$,
  'P0002', 'La cotización no existe',
  'logística no ve la cotización para duplicarla'
);

select * from finish();
rollback;
