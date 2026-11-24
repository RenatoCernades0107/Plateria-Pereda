begin;

select plan(24);

-- IGV en el cotizador (`COT-`).
--   * 2026-11-03: casilla `apply_igv` (por defecto marcada). Los precios se escribían sin
--     IGV: IGV = 18 % de subtotal − descuentos y total = base + IGV. Esas cotizaciones
--     (`prices_include_igv` = false) conservan ese cálculo.
--   * 2026-11-24 (`igv_incluido_cotizaciones`): los precios YA INCLUYEN el IGV. Las nuevas
--     (`prices_include_igv` = true por defecto): total = subtotal − descuentos, base =
--     total ÷ 1.18 y IGV = total − base, con un solo redondeo.
-- Restauraciones y cotizaciones de WhatsApp siguen sin IGV.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000066a2', 'ventas@igv-cotizador.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000066c1', 'persona', 'Iris', 'Gravada');

-- 1. Columnas solo en el cotizador.
select has_column('public', 'quotes', 'apply_igv', 'el cotizador guarda la casilla del IGV');
select has_column('public', 'quotes', 'igv', 'y el monto del IGV');
select has_column('public', 'quotes', 'prices_include_igv', 'y si sus precios incluyen el IGV');
select hasnt_column('public', 'restorations', 'apply_igv', 'las restauraciones no tienen IGV');
select hasnt_column('public', 'whatsapp_quotes', 'apply_igv', 'las cotizaciones de WhatsApp tampoco');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000066a2","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- 2. Precios con IGV incluido (por defecto): 2 × 50.00 + 100.00 con 10 % de descuento =
--    190.00 (es el total). Base = 190.00 ÷ 1.18 = 161.02 (161.0169…); IGV 28.98.
insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"id":"00000000-0000-0000-0000-0000000066f1","title":"Anillo","quantity":2,"unit_price":"50.00"},
    {"id":"00000000-0000-0000-0000-0000000066f2","title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
);
select results_eq(
  $$ select apply_igv, prices_include_igv, subtotal, discount_total, igv, total from public.quotes
     where id = (select id from ids where name = 'q') $$,
  $$ values (true, true, 200.00::numeric, 10.00::numeric, 28.98::numeric, 190.00::numeric) $$,
  'por defecto los precios incluyen IGV: el total es subtotal − descuentos y el IGV se desglosa'
);

-- 3. Cambiar las líneas recalcula el IGV: 240.00 → base 203.39, IGV 36.61.
update public.quote_items set quantity = 3 where id = '00000000-0000-0000-0000-0000000066f1';
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (36.61::numeric, 240.00::numeric) $$,
  'al cambiar una línea se recalculan el IGV y el total (240.00 con 36.61 de IGV)'
);

-- 4. Desmarcar y volver a marcar en el borrador.
update public.quotes set apply_igv = false where id = (select id from ids where name = 'q');
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (0::numeric, 240.00::numeric) $$,
  'desmarcada: sin IGV; el total es el mismo (subtotal − descuentos)'
);
select lives_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q'),
       '{"client_id":"00000000-0000-0000-0000-0000000066c1","apply_igv":true,"prices_include_igv":false}',
       '[{"id":"00000000-0000-0000-0000-0000000066f1","title":"Anillo","quantity":3,"unit_price":"50.00"},
         {"id":"00000000-0000-0000-0000-0000000066f2","title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
     ) $$,
  'save_quote vuelve a marcarla'
);
select results_eq(
  $$ select prices_include_igv, igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (true, 36.61::numeric, 240.00::numeric) $$,
  'marcada otra vez, vuelve el desglose; al editar no se cambia cómo se escribieron los precios'
);

-- 5. Redondeo: una sola vez sobre el total, el medio céntimo lejos del cero.
insert into ids select 'centimos', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"title":"A","quantity":1,"unit_price":"0.03"},{"title":"B","quantity":1,"unit_price":"0.03"},{"title":"C","quantity":1,"unit_price":"0.03"}]'
);
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'centimos') $$,
  $$ values (0.01::numeric, 0.09::numeric) $$,
  'IGV sobre el total (0.09 − 0.09 ÷ 1.18 = 0.01), no línea por línea'
);
insert into ids select 'medio', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"title":"A","quantity":1,"unit_price":"0.25"}]'
);
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'medio') $$,
  $$ values (0.04::numeric, 0.25::numeric) $$,
  '0.25 ÷ 1.18 = 0.2118 → base 0.21 e IGV 0.04, como withoutPercent() de money.ts'
);
insert into ids select 'exacto', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"title":"A","quantity":1,"unit_price":"118.00"}]'
);
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'exacto') $$,
  $$ values (18.00::numeric, 118.00::numeric) $$,
  'S/ 118.00 incluye S/ 18.00 de IGV'
);

-- 6. Las cotizaciones anteriores (precios sin IGV) conservan su cálculo: IGV = 18 % de
--    subtotal − descuentos y total = base + IGV.
insert into ids select 'antigua', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1","prices_include_igv":false}',
  '[{"id":"00000000-0000-0000-0000-0000000066f3","title":"Anillo","quantity":2,"unit_price":"50.00"},
    {"id":"00000000-0000-0000-0000-0000000066f4","title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
);
select results_eq(
  $$ select prices_include_igv, igv, total from public.quotes where id = (select id from ids where name = 'antigua') $$,
  $$ values (false, 34.20::numeric, 224.20::numeric) $$,
  'con precios sin IGV: 18 % de 190.00 = 34.20 y total 224.20'
);
update public.quote_items set quantity = 3 where id = '00000000-0000-0000-0000-0000000066f3';
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'antigua') $$,
  $$ values (43.20::numeric, 283.20::numeric) $$,
  'cambiar una línea de una anterior recalcula con su cálculo (240.00 + 43.20)'
);
update public.quotes set apply_igv = false where id = (select id from ids where name = 'antigua');
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'antigua') $$,
  $$ values (0::numeric, 240.00::numeric) $$,
  'una anterior desmarcada: sin IGV'
);
update public.quotes set apply_igv = true where id = (select id from ids where name = 'antigua');

-- 7. El IGV, el total y cómo se escribieron los precios no se escriben a mano.
select throws_ok(
  $$ update public.quotes set igv = 1 where id = (select id from ids where name = 'q') $$,
  '42501', null, 'el IGV no se escribe a mano'
);
select throws_ok(
  $$ update public.quotes set prices_include_igv = false where id = (select id from ids where name = 'q') $$,
  '42501', null, 'cómo se escribieron los precios no se cambia después de crear la cotización'
);

-- 8. Duplicar conserva la casilla del IGV; la copia siempre usa precios con IGV incluido
-- (también si la original es anterior: se copian los precios y el total sale de la regla nueva).
insert into ids select 'sin', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1","apply_igv":false}',
  '[{"title":"Bandeja","quantity":1,"unit_price":"300.00"}]'
);
insert into ids select 'sin_dup', public.duplicate_quote((select id from ids where name = 'sin'));
insert into ids select 'con_dup', public.duplicate_quote((select id from ids where name = 'q'));
insert into ids select 'antigua_dup', public.duplicate_quote((select id from ids where name = 'antigua'));
select results_eq(
  $$ select n.name, q.apply_igv, q.prices_include_igv, q.total from public.quotes q join ids n on n.id = q.id
     where n.name in ('sin_dup', 'con_dup', 'antigua_dup') order by n.name $$,
  $$ values ('antigua_dup', true, true, 240.00::numeric),
            ('con_dup', true, true, 240.00::numeric),
            ('sin_dup', false, true, 300.00::numeric) $$,
  'duplicar conserva la casilla del IGV y la copia usa precios con IGV incluido'
);

-- 9. Emitida: ya no cambia, y emitir no cambia el total.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');
select results_eq(
  $$ select status::text, igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values ('emitida', 36.61::numeric, 240.00::numeric) $$,
  'emitir conserva el IGV y el total'
);
select throws_ok(
  $$ update public.quotes set apply_igv = false where id = (select id from ids where name = 'q') $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'en una emitida no se cambia la casilla del IGV'
);
update public.quotes set status = 'aceptada',
  delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'q');
select is(
  (select total from public.quotes where id = (select id from ids where name = 'q')),
  240.00::numeric, 'aceptarla conserva el total'
);
-- Una anterior ya emitida no cambia de total al aceptarla.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'antigua');
update public.quotes set status = 'aceptada',
  delivery_date = (now() at time zone 'America/Lima')::date + 10
  where id = (select id from ids where name = 'antigua');
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'antigua') $$,
  $$ values (43.20::numeric, 283.20::numeric) $$,
  'una anterior aceptada conserva su total con IGV sumado (283.20)'
);

-- 10. Tabla: por defecto marcada y con los precios con IGV incluido; las filas que ya
--     existían al migrar quedaron en false (conservan su total).
insert into public.quotes (id, client_id)
  values ('00000000-0000-0000-0000-0000000066e1', '00000000-0000-0000-0000-0000000066c1');
select results_eq(
  $$ select apply_igv, prices_include_igv from public.quotes where id = '00000000-0000-0000-0000-0000000066e1' $$,
  $$ values (true, true) $$,
  'una cotización nueva lleva IGV y sus precios lo incluyen por defecto'
);

select * from finish();
rollback;
