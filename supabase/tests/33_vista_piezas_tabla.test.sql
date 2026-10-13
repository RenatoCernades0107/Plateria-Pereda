begin;

select plan(11);

-- Vista de piezas tipo hoja de cálculo (P55/D62).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000da1', 'admin@tabla.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-000000000da2', 'logistica@tabla.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-000000000da3', 'ventas@tabla.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000da20', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000da30', '00000000-0000-0000-0000-00000000da20', 'contado'),
  ('00000000-0000-0000-0000-00000000da31', '00000000-0000-0000-0000-00000000da20', 'contado');
insert into public.pieces (id, restoration_id, description, service_name, material_name, price, service_cost) values
  ('00000000-0000-0000-0000-00000000da41', '00000000-0000-0000-0000-00000000da30', 'Fuente tabla', 'Limpieza', 'Plata', 150, 40),
  ('00000000-0000-0000-0000-00000000da42', '00000000-0000-0000-0000-00000000da31', 'Bandeja tabla', 'Pulido', 'Alpaca', null, null);
insert into public.restoration_files (restoration_id, piece_id, path, name, mime_type, size_bytes, category) values
  ('00000000-0000-0000-0000-00000000da30', '00000000-0000-0000-0000-00000000da41',
   'restorations/00000000-0000-0000-0000-00000000da30/pieces/00000000-0000-0000-0000-00000000da41/despues.jpg',
   'despues.jpg', 'image/jpeg', 100, 'despues'),
  ('00000000-0000-0000-0000-00000000da30', '00000000-0000-0000-0000-00000000da41',
   'restorations/00000000-0000-0000-0000-00000000da30/pieces/00000000-0000-0000-0000-00000000da41/antes.pdf',
   'antes.pdf', 'application/pdf', 100, 'antes'),
  ('00000000-0000-0000-0000-00000000da30', '00000000-0000-0000-0000-00000000da41',
   'restorations/00000000-0000-0000-0000-00000000da30/pieces/00000000-0000-0000-0000-00000000da41/antes.jpg',
   'antes.jpg', 'image/jpeg', 100, 'antes');

create temp table guia as
  select code, regexp_replace(code, '\D', '', 'g')::int as numero
  from public.restorations where id = '00000000-0000-0000-0000-00000000da30';
grant select on guia to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000da1","role":"authenticated"}', true);
select results_eq(
  $$ select description, service_name, material_name, service_cost, price
     from public.list_pieces_board(p_query => 'tabla') order by description $$,
  $$ values ('Bandeja tabla', 'Pulido', 'Alpaca', null::numeric, null::numeric),
            ('Fuente tabla', 'Limpieza', 'Plata', 40.00::numeric, 150.00::numeric) $$,
  'el admin ve el costo de servicio y el precio de venta'
);
select is(
  (select photo_path from public.list_pieces_board(p_query => 'Fuente tabla')),
  'restorations/00000000-0000-0000-0000-00000000da30/pieces/00000000-0000-0000-0000-00000000da41/antes.jpg',
  'la foto es la primera imagen "Antes" (no la de después ni un PDF)'
);
select is(
  (select photo_path from public.list_pieces_board(p_query => 'Bandeja tabla')),
  null, 'sin foto de antes, sin foto'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'tabla', p_restoration_code => (select code from guia)) $$,
  $$ values ('Fuente tabla') $$,
  'filtra por el código de la guía'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'tabla', p_restoration_code => (select numero::text from guia)) $$,
  $$ values ('Fuente tabla') $$,
  'filtra por el número de la guía, sin el prefijo ni los ceros'
);
select is(
  (select count(*)::int from public.list_pieces_board(p_query => 'tabla', p_restoration_code => 'RES-')),
  2, 'un número de guía sin dígitos no filtra'
);
select is(
  public.get_piece_service_cost('00000000-0000-0000-0000-00000000da41'),
  40.00::numeric, 'el admin ve el costo en el detalle de la pieza'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000da2","role":"authenticated"}', true);
select results_eq(
  $$ select service_cost, price from public.list_pieces_board(p_query => 'Fuente tabla') $$,
  $$ values (40.00::numeric, null::numeric) $$,
  'logística ve el costo de servicio, no el precio de venta'
);
select is(
  public.get_piece_service_cost('00000000-0000-0000-0000-00000000da41'),
  40.00::numeric, 'logística ve el costo en el detalle de la pieza'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000da3","role":"authenticated"}', true);
select results_eq(
  $$ select service_cost, price from public.list_pieces_board(p_query => 'Fuente tabla') $$,
  $$ values (null::numeric, 150.00::numeric) $$,
  'ventas ve el precio de venta, no el costo de servicio'
);
select throws_ok(
  $$ select public.get_piece_service_cost('00000000-0000-0000-0000-00000000da41') $$,
  '42501', null, 'ventas no ve el costo en el detalle de la pieza'
);

select * from finish();
rollback;
