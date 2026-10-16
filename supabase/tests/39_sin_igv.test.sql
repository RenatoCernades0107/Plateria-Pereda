begin;

select plan(14);

-- Sin IGV: los totales son la suma de los precios tal como se escriben; el sistema ya
-- no pregunta ni suma nunca el IGV.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000039a01', 'admin@sin-igv.test', '{"role":"admin"}', '{}');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-000000039c01', 'persona', 'Ana', 'gid://shopify/Customer/3901');

-- 1. Ya no hay respuesta ni función del IGV.
select hasnt_column('public', 'restorations', 'prices_include_igv', 'restorations ya no guarda si el precio incluye IGV');
select hasnt_column('public', 'whatsapp_quotes', 'prices_include_igv', 'las cotizaciones de WhatsApp tampoco');
select hasnt_column('public', 'quotes', 'prices_include_igv', 'ni el cotizador');
select hasnt_function('public', 'price_with_igv', 'ya no existe el precio con IGV');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000039a01","role":"authenticated"}', true);

-- 2. Restauración: el total es la suma de los precios y el adelanto sale de ese total.
create temp table r on commit drop as
select * from public.create_restoration(
  '00000000-0000-0000-0000-000000039c01', null, 'a_cuenta', 50, '',
  '[{"description":"Fuente","price":"33.33"},{"description":"Bandeja","price":"33.33"},
    {"description":"Jarra","price":"33.34"}]'::jsonb
);
select is(
  (select total from public.restorations where id = (select id from r)),
  100.00::numeric, 'total = suma de los precios, sin IGV'
);
select is(
  (select expected_deposit from public.restorations where id = (select id from r)),
  50.00::numeric, 'el adelanto se calcula sobre ese total'
);

-- 3. Las piezas que no se cobran no suman.
reset role;
update public.pieces set status = 'anulada'
  where restoration_id = (select id from r) and description = 'Jarra';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000039a01","role":"authenticated"}', true);
select is(
  (select total from public.restorations where id = (select id from r)),
  66.66::numeric, 'una pieza anulada sale del total'
);

-- 4. Una pieza sin precio suma 0.
create temp table r2 on commit drop as
select * from public.create_restoration(
  '00000000-0000-0000-0000-000000039c01', null, 'contado', null, '',
  '[{"description":"Anillo","price":"10"},{"description":"Collar","price":""}]'::jsonb
);
select is(
  (select total from public.restorations where id = (select id from r2)),
  10.00::numeric, 'el total con piezas sin precio suma solo las que lo tienen'
);

-- 5. Cambiar un precio recalcula el total, también sin IGV.
update public.pieces set price = 25
  where restoration_id = (select id from r2) and description = 'Anillo';
select is(
  (select total from public.restorations where id = (select id from r2)),
  25.00::numeric, 'cambiar el precio de una pieza recalcula el total'
);

-- 6. Cotización de WhatsApp.
create temp table q on commit drop as
select * from public.create_whatsapp_quote(
  null, null, 'Luis', '', 'sin_definir', null, '',
  '[{"description":"Fuente","price":"100"},{"description":"Jarra","price":"50.50"}]'::jsonb
);
select is(
  (select total from public.whatsapp_quotes where id = (select id from q)),
  150.50::numeric, 'la cotización de WhatsApp suma los precios tal cual'
);
select lives_ok(
  $$ select public.update_whatsapp_quote(
       (select id from q), null, null, 'Luis', '', 'sin_definir', null, '',
       '[{"description":"Fuente","price":"200"}]'::jsonb
     ) $$,
  'se edita la cotización de WhatsApp'
);
select is(
  (select total from public.whatsapp_quotes where id = (select id from q)),
  200.00::numeric, 'al editarla se recalcula el total'
);

-- 7. Cotizador: 2 × 50.00 + 100.00 con 10 % de descuento = 190.00, sin IGV.
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-000000039c01"}',
  '[{"title":"Anillo","quantity":2,"unit_price":"50.00"},
    {"title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
);
select results_eq(
  $$ select subtotal, discount_total, total from public.quotes
     where id = (select id from ids where name = 'q') $$,
  $$ values (200.00::numeric, 10.00::numeric, 190.00::numeric) $$,
  'el total de la cotización es subtotal - descuentos'
);
insert into ids select 'dup', public.duplicate_quote((select id from ids where name = 'q'));
select is(
  (select total from public.quotes where id = (select id from ids where name = 'dup')),
  190.00::numeric, 'duplicar conserva el total'
);

select * from finish();
rollback;
