begin;

select plan(17);

-- IGV en el cotizador (`COT-`, 2026-11-03): casilla `apply_igv` (por defecto marcada);
-- IGV = 18 % de subtotal − descuentos, redondeado una vez; total = base + IGV.
-- Restauraciones y cotizaciones de WhatsApp siguen sin IGV.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000066a2', 'ventas@igv-cotizador.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name, last_name)
  values ('00000000-0000-0000-0000-0000000066c1', 'persona', 'Iris', 'Gravada');

-- 1. Columnas solo en el cotizador.
select has_column('public', 'quotes', 'apply_igv', 'el cotizador guarda la casilla del IGV');
select has_column('public', 'quotes', 'igv', 'y el monto del IGV');
select hasnt_column('public', 'restorations', 'apply_igv', 'las restauraciones no tienen IGV');
select hasnt_column('public', 'whatsapp_quotes', 'apply_igv', 'las cotizaciones de WhatsApp tampoco');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000066a2","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- 2. Sin indicarla, la casilla queda marcada: 2 × 50.00 + 100.00 con 10 % de
--    descuento = 190.00; IGV 34.20; total 224.20.
insert into ids select 'q', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"id":"00000000-0000-0000-0000-0000000066f1","title":"Anillo","quantity":2,"unit_price":"50.00"},
    {"id":"00000000-0000-0000-0000-0000000066f2","title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
);
select results_eq(
  $$ select apply_igv, subtotal, discount_total, igv, total from public.quotes
     where id = (select id from ids where name = 'q') $$,
  $$ values (true, 200.00::numeric, 10.00::numeric, 34.20::numeric, 224.20::numeric) $$,
  'por defecto suma el 18 % de subtotal − descuentos'
);

-- 3. Cambiar las líneas recalcula el IGV.
update public.quote_items set quantity = 3 where id = '00000000-0000-0000-0000-0000000066f1';
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (43.20::numeric, 283.20::numeric) $$,
  'al cambiar una línea se recalculan el IGV y el total (240.00 + 43.20)'
);

-- 4. Desmarcar y volver a marcar en el borrador.
update public.quotes set apply_igv = false where id = (select id from ids where name = 'q');
select results_eq(
  $$ select igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values (0::numeric, 240.00::numeric) $$,
  'desmarcada: sin IGV, el total es subtotal − descuentos'
);
select lives_ok(
  $$ select public.save_quote(
       (select id from ids where name = 'q'),
       '{"client_id":"00000000-0000-0000-0000-0000000066c1","apply_igv":true}',
       '[{"id":"00000000-0000-0000-0000-0000000066f1","title":"Anillo","quantity":3,"unit_price":"50.00"},
         {"id":"00000000-0000-0000-0000-0000000066f2","title":"Medalla","quantity":1,"unit_price":"100.00","discount_type":"porcentaje","discount_value":"10"}]'
     ) $$,
  'save_quote vuelve a marcarla'
);
select is(
  (select total from public.quotes where id = (select id from ids where name = 'q')),
  283.20::numeric, 'marcada otra vez, el total vuelve a sumar el IGV'
);

-- 5. Redondeo: una sola vez sobre el total, el medio céntimo lejos del cero.
insert into ids select 'centimos', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"title":"A","quantity":1,"unit_price":"0.03"},{"title":"B","quantity":1,"unit_price":"0.03"},{"title":"C","quantity":1,"unit_price":"0.03"}]'
);
select is(
  (select igv from public.quotes where id = (select id from ids where name = 'centimos')),
  0.02::numeric, 'IGV sobre el total (0.09 × 18 % = 0.0162 → 0.02), no línea por línea (0.03)'
);
insert into ids select 'medio', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1"}',
  '[{"title":"A","quantity":1,"unit_price":"0.25"}]'
);
select is(
  (select igv from public.quotes where id = (select id from ids where name = 'medio')),
  0.05::numeric, '0.25 × 18 % = 0.045 → 0.05, como money.ts'
);

-- 6. El IGV y el total no se escriben a mano.
select throws_ok(
  $$ update public.quotes set igv = 1 where id = (select id from ids where name = 'q') $$,
  '42501', null, 'el IGV no se escribe a mano'
);

-- 7. Duplicar conserva la casilla.
insert into ids select 'sin', public.save_quote(
  null,
  '{"client_id":"00000000-0000-0000-0000-0000000066c1","apply_igv":false}',
  '[{"title":"Bandeja","quantity":1,"unit_price":"300.00"}]'
);
insert into ids select 'sin_dup', public.duplicate_quote((select id from ids where name = 'sin'));
insert into ids select 'con_dup', public.duplicate_quote((select id from ids where name = 'q'));
select results_eq(
  $$ select n.name, q.apply_igv, q.total from public.quotes q join ids n on n.id = q.id
     where n.name in ('sin_dup', 'con_dup') order by n.name $$,
  $$ values ('con_dup', true, 283.20::numeric), ('sin_dup', false, 300.00::numeric) $$,
  'duplicar conserva la casilla del IGV y el total'
);

-- 8. Emitida: ya no cambia, y emitir no cambia el total.
update public.quotes set status = 'emitida' where id = (select id from ids where name = 'q');
select results_eq(
  $$ select status::text, igv, total from public.quotes where id = (select id from ids where name = 'q') $$,
  $$ values ('emitida', 43.20::numeric, 283.20::numeric) $$,
  'emitir conserva el IGV y el total'
);
select throws_ok(
  $$ update public.quotes set apply_igv = false where id = (select id from ids where name = 'q') $$,
  '23514', 'Solo se puede editar una cotización en borrador',
  'en una emitida no se cambia la casilla del IGV'
);
update public.quotes set status = 'aceptada' where id = (select id from ids where name = 'q');
select is(
  (select total from public.quotes where id = (select id from ids where name = 'q')),
  283.20::numeric, 'aceptarla conserva el total con IGV'
);

-- 9. Tabla: por defecto marcada.
insert into public.quotes (id, client_id)
  values ('00000000-0000-0000-0000-0000000066e1', '00000000-0000-0000-0000-0000000066c1');
select is(
  (select apply_igv from public.quotes where id = '00000000-0000-0000-0000-0000000066e1'),
  true, 'una cotización nueva suma el IGV por defecto'
);

select * from finish();
rollback;
