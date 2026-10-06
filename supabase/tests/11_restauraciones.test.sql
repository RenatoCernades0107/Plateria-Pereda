begin;

select plan(25);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'ventas@res.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000007a2', 'logistica@res.test', '{"role":"logistica"}', '{}');

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000b701', 'persona', 'Ana', 'gid://shopify/Customer/701');
insert into public.clients (id, kind, legal_name, document_type, document_number, region,
    shopify_company_id, shopify_company_location_id)
  values ('00000000-0000-0000-0000-00000000b702', 'empresa', 'Restauraciones S.A.C.', 'ruc', '20999999701', 'LIM',
    'gid://shopify/Company/702', 'gid://shopify/CompanyLocation/702');
insert into public.contacts (id, client_id, first_name, shopify_customer_id, shopify_company_contact_id)
  values ('00000000-0000-0000-0000-00000000b703', '00000000-0000-0000-0000-00000000b702', 'Luis',
    'gid://shopify/Customer/703', 'gid://shopify/CompanyContact/703');

-- Con ids fijos para el test (los usuarios no eligen el id: lo hace la BD).
insert into public.restorations (id, client_id, payment_type, deposit_percent)
  values ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000b701', 'a_cuenta', 50);
insert into public.restorations (id, client_id, contact_id, payment_type)
  values ('00000000-0000-0000-0000-00000000c702', '00000000-0000-0000-0000-00000000b702',
    '00000000-0000-0000-0000-00000000b703', 'contado');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.restorations (client_id, payment_type)
     values ('00000000-0000-0000-0000-00000000b701', 'credito') $$,
  'ventas registra una restauración'
);
select ok(
  (select code from public.restorations where id = '00000000-0000-0000-0000-00000000c701') ~ '^RES-\d{5,}$',
  'la restauración recibe un código RES-00000'
);
select cmp_ok(
  (select code from public.restorations where id = '00000000-0000-0000-0000-00000000c702'),
  '>',
  (select code from public.restorations where id = '00000000-0000-0000-0000-00000000c701'),
  'los códigos son correlativos'
);

insert into public.pieces (restoration_id, description, price)
  values ('00000000-0000-0000-0000-00000000c701', 'Fuente ovalada', 150.10),
         ('00000000-0000-0000-0000-00000000c701', 'Bandeja', 99.95);
insert into public.pieces (restoration_id, description, price, arrived_at)
  values ('00000000-0000-0000-0000-00000000c701', 'Candelabro', 0.05, now());

select results_eq(
  $$ select p.number, p.code = r.code || '-' || p.number from public.pieces p
     join public.restorations r on r.id = p.restoration_id
     where p.restoration_id = '00000000-0000-0000-0000-00000000c701' order by p.number $$,
  $$ values (1, true), (2, true), (3, true) $$,
  'las piezas se numeran y su código es RES-00000-n'
);
select results_eq(
  $$ select total, expected_deposit, balance from public.restorations
     where id = '00000000-0000-0000-0000-00000000c701' $$,
  $$ values (250.10::numeric, 125.05::numeric, 250.10::numeric) $$,
  'el total suma las piezas; adelanto esperado = 50 % y saldo = total'
);
select results_eq(
  $$ select location::text from public.pieces
     where restoration_id = '00000000-0000-0000-0000-00000000c701' order by number $$,
  $$ values ('sin_enviar'), ('sin_enviar'), ('sin_enviar') $$,
  'las piezas de oficina nacen en la tienda: Sin enviar (P48)'
);

update public.pieces set price = 200.10
  where restoration_id = '00000000-0000-0000-0000-00000000c701' and number = 1;
select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-00000000c701'),
  300.10::numeric, 'editar un precio recalcula el total'
);

reset role;
-- La anulación la hará el RPC de cambio de estado (8.3); aquí se simula.
update public.pieces set status = 'anulada', cancelled_at = now()
  where restoration_id = '00000000-0000-0000-0000-00000000c701' and number = 2;
select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-00000000c701'),
  200.15::numeric, 'una pieza anulada no suma al total'
);
select is(
  (select location::text from public.pieces
   where restoration_id = '00000000-0000-0000-0000-00000000c701' and number = 2),
  'anulada', 'la ubicación de una pieza anulada es Anulada'
);

insert into public.pieces (restoration_id, description, price)
  values ('00000000-0000-0000-0000-00000000c702', 'Juego de té', 1000);
select results_eq(
  $$ select expected_deposit, balance from public.restorations
     where id = '00000000-0000-0000-0000-00000000c702' $$,
  $$ values (1000::numeric, 1000::numeric) $$,
  'en Contado el adelanto esperado es el total'
);

-- Reglas de integridad
select throws_ok(
  $$ insert into public.restorations (client_id, payment_type)
     values ('00000000-0000-0000-0000-00000000b701', 'a_cuenta') $$,
  '23514', null, 'A cuenta exige el % de adelanto'
);
select throws_ok(
  $$ insert into public.restorations (client_id, payment_type, deposit_percent)
     values ('00000000-0000-0000-0000-00000000b701', 'credito', 30) $$,
  '23514', null, 'el % de adelanto solo va con A cuenta'
);
select throws_ok(
  $$ insert into public.restorations (client_id, payment_type, deposit_percent)
     values ('00000000-0000-0000-0000-00000000b701', 'a_cuenta', 0) $$,
  '23514', null, 'el % de adelanto está entre 1 y 100'
);
select throws_ok(
  $$ insert into public.restorations (client_id, contact_id, payment_type)
     values ('00000000-0000-0000-0000-00000000b701', '00000000-0000-0000-0000-00000000b703', 'contado') $$,
  '23514', null, 'el contacto debe ser de la empresa de la restauración'
);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description, price)
     values ('00000000-0000-0000-0000-00000000c702', 'X', -1) $$,
  '23514', null, 'el precio no puede ser negativo'
);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description, price, weight_grams)
     values ('00000000-0000-0000-0000-00000000c702', 'X', 1, 0) $$,
  '23514', null, 'el peso debe ser mayor que 0'
);
select throws_ok(
  $$ update public.pieces set number = 9
     where restoration_id = '00000000-0000-0000-0000-00000000c702' $$,
  '23514', null, 'el código de una pieza no cambia'
);

-- Permisos por rol
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
select throws_ok(
  $$ update public.restorations set total = 1 where id = '00000000-0000-0000-0000-00000000c701' $$,
  '42501', null, 'ventas no escribe el total (lo calcula la BD)'
);
select throws_ok(
  $$ update public.restorations set client_id = '00000000-0000-0000-0000-00000000b702'
     where id = '00000000-0000-0000-0000-00000000c701' $$,
  '42501', null, 'el cliente de una restauración no se cambia (P12)'
);
select throws_ok(
  $$ update public.pieces set status = 'aprobada'
     where restoration_id = '00000000-0000-0000-0000-00000000c701' $$,
  '42501', null, 'el estado de una pieza solo cambia por su RPC (8.3)'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.restorations) + (select count(*)::int from public.pieces),
  0, 'logística no lee las tablas con precios y montos (P42)'
);
select is(
  (select count(*)::int from public.pieces_operational
   where restoration_id = '00000000-0000-0000-0000-00000000c701'),
  3, 'logística ve las piezas en la vista sin precios'
);
select throws_ok(
  $$ insert into public.restorations (client_id, payment_type)
     values ('00000000-0000-0000-0000-00000000b701', 'contado') $$,
  '42501', null, 'logística no registra restauraciones'
);

reset role;
update public.restorations set status = 'completada' where id = '00000000-0000-0000-0000-00000000c702';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.restorations_operational
   where id in ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000c702')),
  1, 'logística no ve restauraciones pasadas (D24)'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.restorations_operational
   where id in ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000c702')),
  2, 'ventas sí ve las restauraciones pasadas'
);

select * from finish();
rollback;
