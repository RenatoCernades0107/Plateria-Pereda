begin;

select plan(36);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ea1', 'ventas@cwa.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000ea2', 'logistica@cwa.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name, shopify_customer_id) values
  ('00000000-0000-0000-0000-00000000ea20', 'persona', 'Cliente WhatsApp', 'gid://shopify/Customer/ea20'),
  ('00000000-0000-0000-0000-00000000ea21', 'persona', 'Otro Cliente', 'gid://shopify/Customer/ea21');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.create_whatsapp_quote(null, null, 'Ana', '999888777', 'contado', null, '',
       '[{"description":"Fuente","price":"100"}]'::jsonb) $$,
  '42501', null, 'logística no registra cotizaciones'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.create_whatsapp_quote(null, null, '', '', 'contado', null, '', '[]'::jsonb) $$,
  '22023', null, 'una cotización necesita piezas'
);

-- Cotización sin cliente (solo nombre), con tres piezas.
create temporary table q as
  select * from public.create_whatsapp_quote(null, null, '  Ana Pérez ', '', 'a_cuenta', 50, 'Por WhatsApp',
    '[{"description":"Fuente ovalada","service_name":"Limpieza","price":"100"},
      {"description":"Jarra","price":"60.50"},
      {"description":"Candelabro","price":"40"}]'::jsonb);
grant select on q to authenticated;

select ok((select code ~ '^CWA-\d{5,}$' from q), 'la cotización tiene su propio código CWA-');
select results_eq(
  $$ select client_id::text, customer_name, total, status::text, deposit_percent
     from public.whatsapp_quotes where id = (select id from q) $$,
  $$ values (null::text, 'Ana Pérez', 200.50::numeric, 'cotizada', 50.00::numeric) $$,
  'sin cliente guarda el nombre anotado, el total y queda Cotizada'
);
select results_eq(
  $$ select number, description from public.whatsapp_quote_items where quote_id = (select id from q) order by number $$,
  $$ values (1, 'Fuente ovalada'), (2, 'Jarra'), (3, 'Candelabro') $$,
  'las piezas cotizadas quedan numeradas'
);
select is(
  (select count(*)::int from public.restorations), 0,
  'una cotización no crea restauraciones'
);

-- Edición antes de la primera copia.
select lives_ok(
  $$ select public.update_whatsapp_quote((select id from q), null, null, 'Ana Pérez', '999888777', 'a_cuenta', 50, 'Editada',
       '[{"description":"Fuente ovalada","service_name":"Limpieza","price":"120"},
         {"description":"Jarra","price":"60.50"},
         {"description":"Candelabro","price":"40"}]'::jsonb) $$,
  'antes de copiarla se edita'
);
select results_eq(
  $$ select total, customer_phone from public.whatsapp_quotes where id = (select id from q) $$,
  $$ values (220.50::numeric, '999888777') $$,
  'la edición actualiza el total'
);

-- Búsqueda por descripción de pieza.
select results_eq(
  $$ select code, items_count, pending_count from public.list_whatsapp_quotes(p_query => 'candela') $$,
  $$ select code, 3, 3 from q $$,
  'el listado busca por descripción de pieza y cuenta las pendientes'
);

-- Copia: cliente obligatorio.
select throws_ok(
  format($$ select * from public.create_restoration_from_whatsapp_quote(%L, null, null, 'contado', null, '',
    '[{"description":"Jarra","price":"60.50"}]'::jsonb) $$, (select id from q)),
  '23514', 'Elige el cliente de la restauración.', 'la copia exige un cliente'
);

-- Copia de dos piezas: la Fuente (con precio nuevo) y la Jarra.
create temporary table r1 as
  select * from public.create_restoration_from_whatsapp_quote(
    (select id from q), '00000000-0000-0000-0000-00000000ea20', null, 'contado', null, '',
    (select jsonb_build_array(
       jsonb_build_object('quote_item_id', i1.id, 'description', 'Fuente ovalada', 'price', '110', 'arrived', true),
       jsonb_build_object('quote_item_id', i2.id, 'description', 'Jarra', 'price', '60.50'))
     from public.whatsapp_quote_items i1, public.whatsapp_quote_items i2
     where i1.quote_id = (select id from q) and i1.number = 1
       and i2.quote_id = (select id from q) and i2.number = 2));
grant select on r1 to authenticated;

select ok((select code ~ '^RES-\d{5,}$' from r1), 'la copia es una restauración con código RES-');
reset role;
select results_eq(
  $$ select r.origin::text, r.whatsapp_quote_id = (select id from q), r.status::text, r.total, r.client_id::text
     from public.restorations r where r.id = (select id from r1) $$,
  $$ values ('whatsapp', true, 'aprobada', 170.50::numeric, '00000000-0000-0000-0000-00000000ea20') $$,
  'la restauración es de origen WhatsApp, con las piezas aprobadas y el precio editado'
);
select results_eq(
  $$ select status::text, location::text from public.pieces where restoration_id = (select id from r1) order by number $$,
  $$ values ('aprobada', 'por_whatsapp'), ('aprobada', 'por_whatsapp') $$,
  'las piezas entran Aprobadas y Por WhatsApp hasta que lleguen (P48)'
);
select lives_ok(
  $$ select * from public.mark_pieces_arrived(array(
       select p.id from public.pieces p where p.restoration_id = (select id from r1) and p.number = 1)) $$,
  'se marca la llegada de la Fuente'
);
select is(
  (select p.location::text from public.pieces p where p.restoration_id = (select id from r1) and p.number = 1),
  'sin_enviar', 'al marcar la llegada pasa de Por WhatsApp a Sin enviar'
);
select is(
  (select count(*)::int from public.shopify_sync_jobs where kind = 'order.create' and entity_id = (select id::text from r1)),
  1, 'con todas las piezas aprobadas se encola la orden de Shopify'
);
select results_eq(
  $$ select status::text, client_id::text from public.whatsapp_quotes where id = (select id from q) $$,
  $$ values ('pedida_parcial', '00000000-0000-0000-0000-00000000ea20') $$,
  'la cotización queda Pedida en parte y vinculada al cliente'
);
select results_eq(
  $$ select w.restoration_code, w.piece_code from public.whatsapp_quote_item_orders((select id from q)) w
     join public.whatsapp_quote_items i on i.id = w.item_id order by i.number $$,
  $$ select (select code from r1), (select code from r1) || '-' || n from (values (1), (2)) v(n) $$,
  'cada pieza pedida dice en qué restauración'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.update_whatsapp_quote((select id from q), '00000000-0000-0000-0000-00000000ea20', null, '', '',
       'contado', null, '', '[{"description":"Otra","price":"1"}]'::jsonb) $$,
  '23514', 'La cotización ya se pasó a una restauración: no se edita', 'después de la primera copia no se edita'
);
select throws_ok(
  format($$ select * from public.create_restoration_from_whatsapp_quote(%L, %L, null, 'contado', null, '',
    jsonb_build_array(jsonb_build_object('quote_item_id', %L, 'description', 'Jarra', 'price', '1'))) $$,
    (select id from q), '00000000-0000-0000-0000-00000000ea20',
    (select id from public.whatsapp_quote_items where quote_id = (select id from q) and number = 2)),
  '23514', 'Una de las piezas ya se pidió en otra restauración.', 'una pieza ya pedida no se vuelve a pedir'
);
select throws_ok(
  format($$ select * from public.create_restoration_from_whatsapp_quote(%L, %L, null, 'contado', null, '',
    jsonb_build_array(jsonb_build_object('description', 'X', 'price', '1'))) $$,
    (select id from q), '00000000-0000-0000-0000-00000000ea21'),
  '23514', 'La cotización es de otro cliente.', 'las copias siguientes son del mismo cliente'
);

-- Si la pieza copiada se anula, su pieza cotizada vuelve a estar pendiente.
select lives_ok(
  format($$ select * from public.change_piece_status(array[%L]::uuid[], 'anulada', 'Error de registro') $$,
    (select p.id from public.pieces p where p.restoration_id = (select id from r1) and p.number = 2)),
  'ventas anula la Jarra copiada'
);
select results_eq(
  $$ select status::text from public.whatsapp_quotes where id = (select id from q) $$,
  $$ values ('pedida_parcial') $$,
  'la cotización sigue Pedida en parte'
);
select is(
  (select pending_count from public.list_whatsapp_quotes(p_query => (select code from q))),
  2, 'la Jarra anulada vuelve a estar pendiente'
);

-- Descartar y reabrir.
select throws_ok(
  $$ select public.discard_whatsapp_quote((select id from q), '  ') $$,
  '23514', 'Escribe el motivo del descarte.', 'descartar exige motivo'
);
select results_eq(
  $$ select public.discard_whatsapp_quote((select id from q), 'El cliente no respondió')::text $$,
  $$ values ('descartada') $$,
  'ventas descarta la cotización'
);
select throws_ok(
  format($$ select * from public.create_restoration_from_whatsapp_quote(%L, %L, null, 'contado', null, '',
    jsonb_build_array(jsonb_build_object('description', 'X', 'price', '1'))) $$,
    (select id from q), '00000000-0000-0000-0000-00000000ea20'),
  '23514', null, 'una cotización descartada no se copia'
);
select results_eq(
  $$ select public.reopen_whatsapp_quote((select id from q))::text $$,
  $$ values ('pedida_parcial') $$,
  'al reabrirla vuelve a su estado calculado'
);

-- Segunda copia con las dos pendientes y una pieza nueva: Pedida completa.
create temporary table r2 as
  select * from public.create_restoration_from_whatsapp_quote(
    (select id from q), '00000000-0000-0000-0000-00000000ea20', null, 'credito', null, '',
    (select jsonb_agg(jsonb_build_object('quote_item_id', i.id, 'description', i.description, 'price', i.price::text)
       order by i.number)
     from public.whatsapp_quote_items i where i.quote_id = (select id from q) and i.number in (2, 3))
    || jsonb_build_array(jsonb_build_object('description', 'Pieza nueva', 'price', '15', 'urgent', true)));
grant select on r2 to authenticated;
reset role;
select results_eq(
  $$ select status::text from public.whatsapp_quotes where id = (select id from q) $$,
  $$ values ('pedida') $$,
  'con todas las piezas pedidas queda Pedida completa'
);
select results_eq(
  $$ select count(*)::int, count(*) filter (where whatsapp_quote_item_id is null)::int,
       count(*) filter (where urgent)::int
     from public.pieces where restoration_id = (select id from r2) $$,
  $$ values (3, 1, 1) $$,
  'la copia admite piezas nuevas (urgentes incluso)'
);

-- Filtro por origen en el listado de restauraciones.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea1","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::int from public.list_restorations(p_origin => array['whatsapp']::public.restoration_origin[]) $$,
  $$ values (2) $$,
  'el listado de restauraciones filtra por origen WhatsApp'
);
select is(
  (select count(*)::int from public.list_restorations(p_origin => array['oficina']::public.restoration_origin[])
   where client_id = '00000000-0000-0000-0000-00000000ea20'),
  0, 'y por origen oficina'
);

-- Logística no ve cotizaciones.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea2","role":"authenticated"}', true);
select is((select count(*)::int from public.whatsapp_quotes), 0, 'logística no lee cotizaciones');
select is((select count(*)::int from public.list_whatsapp_quotes()), 0, 'ni las lista');
select throws_ok(
  $$ select public.discard_whatsapp_quote((select id from q), 'x') $$,
  '42501', null, 'ni las descarta'
);
select throws_ok(
  $$ insert into public.whatsapp_quotes (payment_type) values ('contado') $$,
  '42501', null, 'nadie escribe directo en la tabla'
);

select * from finish();
rollback;
