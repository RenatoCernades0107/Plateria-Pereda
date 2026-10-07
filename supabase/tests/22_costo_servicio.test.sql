begin;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ca1', 'admin@costo.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-000000000ca2', 'logistica@costo.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-000000000ca3', 'ventas@costo.test', '{"role":"ventas"}', '{}');
insert into public.workshops (id, name, active) values
  ('00000000-0000-0000-0000-00000000ca10', 'Taller Costo', true),
  ('00000000-0000-0000-0000-00000000ca11', 'Otro Taller', true);
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000ca20', 'persona', 'Ana', 'gid://shopify/Customer/ca20');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000ca30', '00000000-0000-0000-0000-00000000ca20', 'contado');
insert into public.pieces (id, restoration_id, description, price, workshop_id) values
  ('00000000-0000-0000-0000-00000000ca41', '00000000-0000-0000-0000-00000000ca30', 'Fuente', 100, '00000000-0000-0000-0000-00000000ca10'),
  ('00000000-0000-0000-0000-00000000ca42', '00000000-0000-0000-0000-00000000ca30', 'Bandeja', 50, '00000000-0000-0000-0000-00000000ca10'),
  ('00000000-0000-0000-0000-00000000ca43', '00000000-0000-0000-0000-00000000ca30', 'Jarra', 70, '00000000-0000-0000-0000-00000000ca11');

select is(
  (select service_cost from public.pieces where id = '00000000-0000-0000-0000-00000000ca41'),
  null, 'el costo de servicio es opcional al registrar la pieza'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_piece_service_cost('00000000-0000-0000-0000-00000000ca41', 120.5) $$,
  'logística define el costo'
);
select throws_ok(
  $$ select public.set_piece_service_cost('00000000-0000-0000-0000-00000000ca41', -1) $$,
  '23514', null, 'no acepta costos negativos'
);
select is(
  (select total_cost from public.list_workshop_pieces('00000000-0000-0000-0000-00000000ca10') limit 1),
  120.50, 'el listado suma el costo de las piezas del taller'
);
select is(
  (select count(*)::int from public.list_workshop_pieces('00000000-0000-0000-0000-00000000ca10')),
  2, 'el listado solo trae las piezas de ese taller'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca1","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_piece_service_cost('00000000-0000-0000-0000-00000000ca41', null) $$,
  'admin deja el costo sin definir otra vez'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca3","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_piece_service_cost('00000000-0000-0000-0000-00000000ca41', 10) $$,
  '42501', null, 'ventas no cambia el costo de servicio'
);
select throws_ok(
  $$ select * from public.list_workshop_pieces('00000000-0000-0000-0000-00000000ca10') $$,
  '42501', null, 'ventas no ve la tabla del taller'
);

reset role;
select is(
  (select count(*)::int from public.audit_log
   where record_id = '00000000-0000-0000-0000-00000000ca41' and changes ? 'service_cost'),
  2, 'los cambios del costo quedan auditados'
);

select * from finish();
rollback;
