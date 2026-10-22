begin;

select plan(6);

-- Importe con techo (2026-10-22): con más de una unidad, precio × cantidad se redondea
-- hacia arriba al sol entero; con una, el precio tal cual.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000053a1', 'ventas@techo.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000053c1', 'persona', 'Techo');

select is(private.piece_amount(26.66, 3), 80::numeric, '3 × 26.66 = 79.98 sube a 80');
select is(private.piece_amount(26.50, 1), 26.50::numeric, 'con una unidad, el precio tal cual');
select is(private.piece_amount(25, 4), 100::numeric, 'un importe entero no cambia');

insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000053d1', '00000000-0000-0000-0000-0000000053c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, quantity) values
  ('00000000-0000-0000-0000-0000000053e1', '00000000-0000-0000-0000-0000000053d1', 'Ceniceros', 26.66, 3),
  ('00000000-0000-0000-0000-0000000053e2', '00000000-0000-0000-0000-0000000053d1', 'Fuente', 26.50, 1);
select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-0000000053d1'),
  106.50::numeric, 'el total de la restauración usa el importe con techo'
);
update public.pieces set price = 10.10 where id = '00000000-0000-0000-0000-0000000053e1';
select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-0000000053d1'),
  57.50::numeric, 'cambiar el precio recalcula con techo (3 × 10.10 = 30.30 → 31)'
);

create temporary table created (id uuid);
grant all on created to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000053a1","role":"authenticated"}', true);
insert into created
select id from public.create_whatsapp_quote(
  '00000000-0000-0000-0000-0000000053c1', null, null, null, 'contado', null, '',
  '[{"description": "Ceniceros cotizados", "price": 26.66, "quantity": 3},
    {"description": "Bandeja cotizada", "price": 15.5}]');
reset role;
select is(
  (select total from public.whatsapp_quotes where id = (select id from created)),
  95.50::numeric, 'el total de la cotización usa el importe con techo'
);

select * from finish();
rollback;
