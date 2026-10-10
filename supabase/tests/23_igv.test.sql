begin;

select plan(14);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000023a01', 'ventas@igv.test', '{"role":"ventas"}', '{}');

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-000000023c01', 'persona', 'Ana', 'gid://shopify/Customer/2301');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000023a01","role":"authenticated"}', true);

-- 1. Precio con IGV: + 18 % redondeado a céntimos (igual que priceWithIgv()).
select is(public.price_with_igv(100, false), 118.00::numeric, 'sin IGV suma el 18 %');
select is(public.price_with_igv(33.33, false), 39.33::numeric, 'redondea a céntimos');
select is(public.price_with_igv(0.25, false), 0.30::numeric, 'los empates se alejan del cero');
select is(public.price_with_igv(100, true), 100::numeric, 'con IGV incluido no cambia');

-- 2. Registro sin IGV: el total suma pieza por pieza.
create temp table r on commit drop as
select * from public.create_restoration(
  '00000000-0000-0000-0000-000000023c01', null, 'a_cuenta', 50, '',
  '[{"description":"Fuente","price":"33.33"},{"description":"Bandeja","price":"33.33"},
    {"description":"Jarra","price":"33.34"}]'::jsonb,
  false
);

select is(
  (select prices_include_igv from public.restorations where id = (select id from r)),
  false, 'guarda la respuesta'
);
select is(
  (select total from public.restorations where id = (select id from r)),
  118.00::numeric, 'total = suma de cada precio + 18 %'
);
select is(
  (select expected_deposit from public.restorations where id = (select id from r)),
  59.00::numeric, 'el adelanto se calcula sobre el total con IGV'
);

-- 3. Las piezas que no se cobran no suman.
reset role;
update public.pieces set status = 'anulada'
  where restoration_id = (select id from r) and description = 'Jarra';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000023a01","role":"authenticated"}', true);
select is(
  (select total from public.restorations where id = (select id from r)),
  78.66::numeric, 'una pieza anulada sale del total'
);

-- 4. Cambiar la respuesta recalcula el total.
update public.restorations set prices_include_igv = true where id = (select id from r);
select is(
  (select total from public.restorations where id = (select id from r)),
  66.66::numeric, 'con IGV incluido el total es la suma de los precios'
);

-- 5. Por defecto (llamadas antiguas): IGV incluido.
create temp table r2 on commit drop as
select * from public.create_restoration(
  '00000000-0000-0000-0000-000000023c01', null, 'contado', null, '',
  '[{"description":"Anillo","price":"10"}]'::jsonb
);
select is(
  (select prices_include_igv from public.restorations where id = (select id from r2)),
  true, 'sin respuesta queda con IGV incluido'
);

-- 6. Con la orden de Shopify creada ya no se cambia.
reset role;
update public.restorations set shopify_order_id = 'gid://shopify/Order/2301'
  where id = (select id from r);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000023a01","role":"authenticated"}', true);
select throws_ok(
  $$ update public.restorations set prices_include_igv = false
     where id = (select id from r) $$,
  '23514', null, 'con la orden creada no se cambia si el precio incluye IGV'
);

-- 7. Cotización de WhatsApp con la misma regla.
create temp table q on commit drop as
select * from public.create_whatsapp_quote(
  null, null, 'Luis', '', 'sin_definir', null, '',
  '[{"description":"Fuente","price":"100"}]'::jsonb,
  false
);
select is(
  (select total from public.whatsapp_quotes where id = (select id from q)),
  118.00::numeric, 'la cotización de WhatsApp suma el IGV'
);
select lives_ok(
  $$ select public.update_whatsapp_quote(
       (select id from q), null, null, 'Luis', '', 'sin_definir', null, '',
       '[{"description":"Fuente","price":"200"}]'::jsonb, true
     ) $$,
  'se edita la respuesta de la cotización'
);
select is(
  (select total from public.whatsapp_quotes where id = (select id from q)),
  200.00::numeric, 'al editarla se recalcula el total'
);

select * from finish();
rollback;
