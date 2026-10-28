begin;

select plan(13);

-- Sucursales: catálogo del admin (como los métodos de pago) y sucursal de cada pago,
-- que va como etiqueta del pedido de Shopify.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000055a01', 'admin@sucursales.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-000000055a02', 'ventas@sucursales.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000055a03', 'logistica@sucursales.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-000000055c01', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-000000055f01', '00000000-0000-0000-0000-000000055c01', 'contado');
insert into public.pieces (id, restoration_id, description, price, quantity, approved_at, status)
  values ('00000000-0000-0000-0000-000000055b01', '00000000-0000-0000-0000-000000055f01', 'Copa', 100, 1, now(), 'aprobada');
insert into public.branches (id, name) values
  ('00000000-0000-0000-0000-000000055e01', 'Sucursal Prueba Uso'),
  ('00000000-0000-0000-0000-000000055e02', 'Sucursal Prueba Libre');

select is(
  (select count(*)::int from public.branches where name in (
    'RUS CARMEN - VENTAS2', 'PEREDA SAC - VENTAS1', 'RUS REGINA - LOGISTICA',
    'RUS ANDREA - MKT', 'PEREDA 4TA - CAJA')),
  5, 'vienen las cinco sucursales'
);

set local role authenticated;

-- Ventas registra un pago con sucursal: se guarda su nombre.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000055a02","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.branches),
  7, 'ventas lee las sucursales'
);
select lives_ok(
  $$insert into public.payments (restoration_id, amount, method_name, branch_id)
    values ('00000000-0000-0000-0000-000000055f01', 30, 'Efectivo', '00000000-0000-0000-0000-000000055e01')$$,
  'ventas registra un pago con sucursal'
);
select is(
  (select branch_name from public.payments where restoration_id = '00000000-0000-0000-0000-000000055f01'),
  'Sucursal Prueba Uso', 'el pago guarda el nombre de la sucursal'
);
select throws_ok(
  $$insert into public.branches (name) values ('Nueva de Ventas')$$,
  '42501', null, 'ventas no crea sucursales'
);

-- Logística no ve las sucursales (no ve pagos, P42).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000055a03","role":"authenticated"}', true);
select is((select count(*)::int from public.branches), 0, 'logística no ve las sucursales');

-- El admin las gestiona.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000055a01","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.branches (name) values ('Nueva Sucursal')$$,
  'el admin crea una sucursal'
);
select throws_ok(
  $$insert into public.branches (name) values (' nueva sucursal ')$$,
  '23505', null, 'no se repite el nombre (sin importar mayúsculas ni espacios)'
);
select throws_ok(
  $$insert into public.branches (name) values ('Con, coma')$$,
  '23514', null, 'el nombre no lleva comas (va como etiqueta de Shopify)'
);
select throws_ok(
  $$insert into public.branches (name) values (repeat('x', 41))$$,
  '23514', null, 'el nombre tiene máximo 40 caracteres'
);
select lives_ok(
  $$update public.branches set name = 'Sucursal Prueba Renombrada'
    where id = '00000000-0000-0000-0000-000000055e01'$$,
  'el admin la renombra'
);
select throws_ok(
  $$delete from public.branches where id = '00000000-0000-0000-0000-000000055e01'$$,
  '23503', '“Sucursal Prueba Renombrada” está en uso en 1 pago. Desactívala en su lugar.',
  'una sucursal con pagos no se borra'
);
select lives_ok(
  $$delete from public.branches where id = '00000000-0000-0000-0000-000000055e02'$$,
  'una sucursal sin pagos se borra'
);

select * from finish();
rollback;
