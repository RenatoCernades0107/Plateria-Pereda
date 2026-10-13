begin;

select plan(10);

-- Estado general "Parcialmente aprobada" (P54/D61).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ba1', 'ventas@parcial.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000ba20', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000ba30', '00000000-0000-0000-0000-00000000ba20', 'contado');
insert into public.pieces (id, restoration_id, description, service_name, price) values
  ('00000000-0000-0000-0000-00000000ba41', '00000000-0000-0000-0000-00000000ba30', 'Fuente', 'Limpieza', 100),
  ('00000000-0000-0000-0000-00000000ba42', '00000000-0000-0000-0000-00000000ba30', 'Bandeja', 'Limpieza', 50),
  ('00000000-0000-0000-0000-00000000ba43', '00000000-0000-0000-0000-00000000ba30', 'Jarra', 'Limpieza', 70);

select is(
  (select array_position(enum_range(null::public.restoration_status), 'parcialmente_aprobada'))
    + 1,
  (select array_position(enum_range(null::public.restoration_status), 'aprobada')),
  'Parcialmente aprobada va justo antes de Aprobada'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ba1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ba41']::uuid[], 'aprobada') $$,
  'ventas aprueba una de las tres piezas'
);
reset role;
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-00000000ba30'),
  'parcialmente_aprobada', 'una aprobada y otras por aprobar: Parcialmente aprobada'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ba1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ba42']::uuid[], 'en_consulta', 'Consultar el precio') $$,
  'ventas consulta otra pieza'
);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ba42']::uuid[], 'en_espera') $$,
  'queda en espera de la respuesta del cliente'
);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ba42']::uuid[], 'rechazada', 'No le conviene el precio') $$,
  'el cliente la rechaza'
);
reset role;
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-00000000ba30'),
  'parcialmente_aprobada', 'la rechazada no cuenta: aún falta aprobar una'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ba1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ba43']::uuid[], 'aprobada') $$,
  'ventas aprueba la última'
);
reset role;
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-00000000ba30'),
  'aprobada', 'todas las vivas aprobadas: Aprobada'
);

select throws_ok(
  $$ update public.restorations set status = 'en_proceso' where id = '00000000-0000-0000-0000-00000000ba30' $$,
  '23514', null, 'En proceso ya no se usa (P56)'
);

select * from finish();
rollback;
