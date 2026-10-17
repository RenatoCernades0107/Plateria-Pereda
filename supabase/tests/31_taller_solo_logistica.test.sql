begin;

select plan(14);

-- El taller lo asignan o cambian solo logística y el admin (D60, P53).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ca1', 'ventas@taller.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-000000000ca2', 'logistica@taller.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-000000000ca3', 'admin@taller.test', '{"role":"admin"}', '{}');
insert into public.workshops (id, name, active) values
  ('00000000-0000-0000-0000-00000000ca10', 'Taller Sur', true),
  ('00000000-0000-0000-0000-00000000ca11', 'Taller Este', true);
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000ca20', 'persona', 'Ana', 'gid://shopify/Customer/ca20');
insert into public.services (name) values ('Limpieza') on conflict do nothing;
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000ca30', '00000000-0000-0000-0000-00000000ca20', 'contado');
insert into public.pieces (id, restoration_id, description, price, workshop_id) values
  ('00000000-0000-0000-0000-00000000ca41', '00000000-0000-0000-0000-00000000ca30', 'Fuente', 100,
   '00000000-0000-0000-0000-00000000ca10'),
  ('00000000-0000-0000-0000-00000000ca42', '00000000-0000-0000-0000-00000000ca30', 'Bandeja', 50, null);
update public.pieces set status = 'aprobada', approved_at = now(), arrived_at = now()
  where id = '00000000-0000-0000-0000-00000000ca42';

-- Ventas
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca1","role":"authenticated"}', true);

select throws_ok(
  $$ select public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ca41']::uuid[], '00000000-0000-0000-0000-00000000ca11') $$,
  '42501', 'Solo logística y el administrador asignan el taller.', 'ventas no usa «Asignar taller»'
);
select throws_ok(
  $$ update public.pieces set workshop_id = '00000000-0000-0000-0000-00000000ca11'
     where id = '00000000-0000-0000-0000-00000000ca41' $$,
  '42501', 'Solo logística y el administrador asignan el taller.', 'ventas no cambia el taller al editar la pieza'
);
select throws_ok(
  $$ update public.pieces set workshop_id = null where id = '00000000-0000-0000-0000-00000000ca41' $$,
  '42501', 'Solo logística y el administrador asignan el taller.', 'ventas tampoco lo quita'
);
select lives_ok(
  $$ update public.pieces set notes = 'Con cuidado', workshop_id = '00000000-0000-0000-0000-00000000ca10'
     where id = '00000000-0000-0000-0000-00000000ca41' $$,
  'ventas edita la pieza si deja el mismo taller'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000ca20', null, 'contado', null, '',
       '[{"description": "Jarra", "service_name": "Limpieza", "workshop_id": "00000000-0000-0000-0000-00000000ca10"}]') $$,
  '42501', 'Solo logística y el administrador asignan el taller.', 'ventas no registra piezas con taller'
);
select lives_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000ca20', null, 'contado', null, '',
       '[{"description": "Jarra", "service_name": "Limpieza"}]') $$,
  'ventas registra piezas sin taller'
);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description, workshop_id)
     values ('00000000-0000-0000-0000-00000000ca30', 'Azucarera', '00000000-0000-0000-0000-00000000ca10') $$,
  '42501', 'Solo logística y el administrador asignan el taller.', 'ventas no agrega una pieza con taller'
);

-- Logística
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca2","role":"authenticated"}', true);
select is(
  public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ca42']::uuid[], '00000000-0000-0000-0000-00000000ca10'),
  1, 'logística asigna el taller'
);
select lives_ok(
  $$ select * from public.send_pieces_to_workshop(array['00000000-0000-0000-0000-00000000ca42']::uuid[],
       '00000000-0000-0000-0000-00000000ca11') $$,
  'logística envía al taller eligiendo otro taller'
);
reset role;
select is(
  (select workshop_id::text from public.pieces where id = '00000000-0000-0000-0000-00000000ca42'),
  '00000000-0000-0000-0000-00000000ca11', 'la pieza queda en el taller elegido al enviarla'
);

-- Admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca3","role":"authenticated"}', true);
select is(
  public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ca41']::uuid[], '00000000-0000-0000-0000-00000000ca11'),
  1, 'el admin asigna el taller'
);
select lives_ok(
  $$ update public.pieces set workshop_id = null where id = '00000000-0000-0000-0000-00000000ca41' $$,
  'el admin cambia el taller al editar la pieza'
);
select lives_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000ca20', null, 'contado', null, '',
       '[{"description": "Jarra", "service_name": "Limpieza", "workshop_id": "00000000-0000-0000-0000-00000000ca10"}]') $$,
  'el admin registra piezas con taller'
);
reset role;
select is(
  (select count(*)::int from public.pieces p join public.restorations r on r.id = p.restoration_id
   where r.client_id = '00000000-0000-0000-0000-00000000ca20' and p.description = 'Jarra'
     and p.workshop_id = '00000000-0000-0000-0000-00000000ca10'),
  1, 'solo la pieza registrada por el admin tiene taller'
);

select * from finish();
rollback;
