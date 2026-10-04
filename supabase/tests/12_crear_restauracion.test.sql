begin;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000008a1', 'ventas@crear.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000008a2', 'logistica@crear.test', '{"role":"logistica"}', '{}');

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000d801', 'persona', 'Ana', 'gid://shopify/Customer/801');
insert into public.clients (id, kind, first_name, active, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000d802', 'persona', 'Inactiva', false, 'gid://shopify/Customer/802');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}', true);

create temporary table created on commit drop as
select * from public.create_restoration(
  '00000000-0000-0000-0000-00000000d801', null, 'a_cuenta', 40, 'Urgente',
  '[{"description": "Fuente", "price": "150.50", "measure": "40 cm", "service_name": "Limpieza", "weight_grams": "820.5", "arrived": true},
    {"description": "Bandeja", "price": "99.50", "arrived": false}]'
);

select ok((select code from created) ~ '^RES-\d{5,}$', 'devuelve el código de la restauración');
select results_eq(
  $$ select r.total, r.deposit_percent, r.expected_deposit, r.notes, r.created_by::text
     from public.restorations r join created c on c.id = r.id $$,
  $$ values (250.00::numeric, 40.00::numeric, 100.00::numeric, 'Urgente', '00000000-0000-0000-0000-0000000008a1') $$,
  'guarda la restauración con su total, adelanto y autor'
);
select results_eq(
  $$ select p.code = c.code || '-' || p.number, p.service_name, p.weight_grams, p.arrived_at is not null
     from public.pieces p join created c on c.id = p.restoration_id order by p.number $$,
  $$ values (true, 'Limpieza', 820.50::numeric, true), (true, '', null::numeric, false) $$,
  'crea las piezas con sus códigos, datos y llegada a tienda'
);
select is(
  (select count(*)::int from public.audit_log a join created c on a.record_id = c.id::text
   where a.table_name = 'restorations' and a.action = 'insert'),
  1, 'queda auditada'
);

select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000d801', null, 'contado', null, '', '[]') $$,
  '22023', null, 'rechaza una restauración sin piezas'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000d801', null, 'contado', null, '',
       '[{"description": "Buena", "price": "10"}, {"description": "Mala", "price": "-5"}]') $$,
  '23514', null, 'rechaza datos inválidos de una pieza'
);
select is(
  (select count(*)::int from public.restorations where client_id = '00000000-0000-0000-0000-00000000d801'),
  1, 'todo o nada: el intento fallido no dejó la restauración ni sus piezas'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000d802', null, 'contado', null, '',
       '[{"description": "X", "price": "10"}]') $$,
  '23503', null, 'rechaza clientes desactivados'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000008a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000d801', null, 'contado', null, '',
       '[{"description": "X", "price": "10"}]') $$,
  '42501', null, 'logística no registra restauraciones'
);

select * from finish();
rollback;
