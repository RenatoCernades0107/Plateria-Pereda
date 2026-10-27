begin;

select plan(19);
-- Estas pruebas no tratan pagos: se entrega como si el saldo estuviera confirmado (P45).
select set_config('app.deliver_with_balance', 'on', true);

-- Fecha estimada de entrega de las piezas urgentes (2026-10-27): una pieza urgente
-- siempre lleva fecha; si no la tiene (las marcadas antes), se puede colocar.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000055a1', 'admin@fecha.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000055a3', 'logistica@fecha.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000055c1', 'persona', 'Rosa');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-0000000055d1', '00000000-0000-0000-0000-0000000055c1', 'contado');
-- E1: urgente de antes de la regla (sin fecha). E2: normal. E3: entregada.
-- Se crean antes de activar la regla del trigger para imitar los datos previos.
alter table public.pieces disable trigger pieces_guard_urgent_date;
insert into public.pieces (id, restoration_id, description, price, urgent) values
  ('00000000-0000-0000-0000-0000000055e1', '00000000-0000-0000-0000-0000000055d1', 'Fuente', 100, true),
  ('00000000-0000-0000-0000-0000000055e2', '00000000-0000-0000-0000-0000000055d1', 'Jarra', 100, false),
  ('00000000-0000-0000-0000-0000000055e3', '00000000-0000-0000-0000-0000000055d1', 'Plato', 100, false);
alter table public.pieces enable trigger pieces_guard_urgent_date;
update public.pieces set status = 'entregada', delivered_at = now()
  where id = '00000000-0000-0000-0000-0000000055e3';

-- 1. La regla en la tabla.
select lives_ok(
  $$ update public.pieces set notes = 'Con dedicatoria' where id = '00000000-0000-0000-0000-0000000055e1' $$,
  'una urgente de antes, sin fecha, se sigue editando'
);
select throws_ok(
  $$ update public.pieces set urgent = true where id = '00000000-0000-0000-0000-0000000055e2' $$,
  '23514', 'Una pieza urgente necesita fecha estimada de entrega.',
  'no se marca urgente sin fecha'
);
select throws_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = private.lima_today() - 1
     where id = '00000000-0000-0000-0000-0000000055e2' $$,
  '23514', 'La fecha estimada de entrega no puede ser anterior a hoy.',
  'la fecha no puede ser pasada'
);
select lives_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = private.lima_today() + 3
     where id = '00000000-0000-0000-0000-0000000055e2' $$,
  'se marca urgente con fecha'
);
select throws_ok(
  $$ update public.pieces set estimated_delivery_date = null where id = '00000000-0000-0000-0000-0000000055e2' $$,
  '23514', 'Una pieza urgente necesita fecha estimada de entrega.',
  'a una urgente con fecha no se le quita la fecha'
);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description, urgent)
     values ('00000000-0000-0000-0000-0000000055d1', 'Copa', true) $$,
  '23514', 'Una pieza urgente necesita fecha estimada de entrega.',
  'una pieza nueva urgente trae su fecha'
);
select lives_ok(
  $$ update public.pieces set urgent = false where id = '00000000-0000-0000-0000-0000000055e2' $$,
  'se quita la marca de urgente'
);
select is(
  (select estimated_delivery_date from public.pieces where id = '00000000-0000-0000-0000-0000000055e2'),
  null, 'al quitar urgente se borra la fecha'
);
select throws_ok(
  $$ update public.pieces set estimated_delivery_date = private.lima_today() + 3
     where id = '00000000-0000-0000-0000-0000000055e3' $$,
  '23514', 'De una pieza cerrada o entregada no se cambian las fechas estimadas de entrega',
  'una pieza entregada no cambia su fecha'
);

-- 2. La RPC: logística marca con fecha, coloca la fecha a una urgente que no la tiene,
--    la cambia y la borra al quitar la marca.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a3","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.set_pieces_urgent(array['00000000-0000-0000-0000-0000000055e2']::uuid[], true) $$,
  '22023', 'Indica la fecha estimada de entrega de la pieza urgente.',
  'marcar urgente exige la fecha'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000055e2']::uuid[], true, private.lima_today() + 5) $$,
  'logística marca urgente con fecha'
);
select is(
  (select estimated_delivery_date from public.pieces_operational where id = '00000000-0000-0000-0000-0000000055e2'),
  private.lima_today() + 5, 'la vista operativa trae la fecha'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000055e1']::uuid[], true, private.lima_today() + 7) $$,
  'se coloca la fecha a una urgente que no la tenía'
);
select is(
  (select estimated_delivery_date from public.pieces_operational where id = '00000000-0000-0000-0000-0000000055e1'),
  private.lima_today() + 7, 'la urgente de antes ya tiene fecha'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000055e1']::uuid[], true, private.lima_today() + 9) $$,
  'se cambia la fecha de una urgente'
);
select is(
  (select count(*)::int from public.list_pieces_board() b
   where b.id = '00000000-0000-0000-0000-0000000055e1' and b.estimated_delivery_date = private.lima_today() + 9),
  1, 'la vista de piezas devuelve la fecha'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(array['00000000-0000-0000-0000-0000000055e1']::uuid[], false) $$,
  'quitar urgente no pide fecha'
);
select is(
  (select estimated_delivery_date from public.pieces_operational where id = '00000000-0000-0000-0000-0000000055e1'),
  null, 'al quitar urgente la fecha se borra'
);

-- 3. Registrar una guía: la pieza urgente trae su fecha.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000055a1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-0000000055c1', null, 'contado', null, '',
       '[{"description": "Cuchara", "urgent": true}]'::jsonb) $$,
  '23514', 'Una pieza urgente necesita fecha estimada de entrega.',
  'la guía no se registra con una urgente sin fecha'
);

select * from finish();
rollback;
