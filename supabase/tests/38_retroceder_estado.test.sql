begin;

select plan(17);

-- Retroceder el estado de una pieza (2026-10-15): vuelve al estado anterior del
-- historial, un paso a la vez, con motivo obligatorio. Queda en la línea de tiempo.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000038a1', 'ventas@retroceso.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000038a2', 'logistica@retroceso.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000038a3', 'admin@retroceso.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.workshops (id, name) values ('00000000-0000-0000-0000-0000000038b1', 'Taller Retroceso');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000038c1', 'persona', 'Rita');
-- Oficina: las piezas nacen en la tienda. A: aprobar y enviar al taller. B: anular.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000038d1', '00000000-0000-0000-0000-0000000038c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, service_cost) values
  ('00000000-0000-0000-0000-0000000038e1', '00000000-0000-0000-0000-0000000038d1', 'Fuente', 100, 40),
  ('00000000-0000-0000-0000-0000000038e2', '00000000-0000-0000-0000-0000000038d1', 'Jarra', 100, 40);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038a1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(
  array['00000000-0000-0000-0000-0000000038e1', '00000000-0000-0000-0000-0000000038e2']::uuid[], 'aprobada') $$,
  'ventas aprueba las dos piezas'
);

select is(
  public.piece_previous_status('00000000-0000-0000-0000-0000000038e1'),
  'registrada'::public.piece_status,
  'el estado anterior sale del historial'
);
select throws_ok(
  $$ select * from public.undo_piece_status('00000000-0000-0000-0000-0000000038e1', '  ') $$,
  '23514', 'Escribe el motivo del retroceso.', 'retroceder exige el motivo'
);

-- Logística no podía aprobar, así que no deshace la aprobación.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.undo_piece_status('00000000-0000-0000-0000-0000000038e1', 'Error') $$,
  '42501', 'Tu rol no puede retroceder este cambio de estado.', 'quien no podía hacer el avance no lo deshace'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038a1","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.undo_piece_status('00000000-0000-0000-0000-0000000038e1', 'Aprobé la pieza equivocada') $$,
  $$ values ('registrada') $$,
  'ventas retrocede Aprobada a Registrada'
);
select is(
  (select approved_at from public.pieces where id = '00000000-0000-0000-0000-0000000038e1'),
  null::timestamptz,
  'la fecha de aprobación vuelve a estar vacía'
);
select throws_ok(
  $$ select * from public.undo_piece_status('00000000-0000-0000-0000-0000000038e1', 'Otra vez') $$,
  '23514', null, 'una pieza recién registrada no tiene estado anterior'
);

-- El retroceso queda en la línea de tiempo (el historial no se borra).
select results_eq(
  $$ select event::text, from_status::text, to_status::text, note, actor_name
     from public.piece_status_history
     where piece_id = '00000000-0000-0000-0000-0000000038e1' order by id desc limit 1 $$,
  $$ values ('retroceso', 'aprobada', 'registrada', 'Aprobé la pieza equivocada', 'Vera Ventas') $$,
  'el retroceso queda en el historial con quién y el motivo'
);
select is(
  (select count(*)::int from public.piece_status_history
   where piece_id = '00000000-0000-0000-0000-0000000038e1'),
  3, 'registro, aprobación y retroceso: no se borra nada'
);

-- Se puede avanzar de nuevo y retroceder otra vez.
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-0000000038e1']::uuid[], 'aprobada') $$,
  'se vuelve a aprobar la pieza'
);
select is(
  public.piece_previous_status('00000000-0000-0000-0000-0000000038e1'),
  'registrada'::public.piece_status,
  'tras volver a aprobar, el estado anterior es otra vez Registrada'
);

-- Enviada al taller y retrocedida: las fechas del envío se limpian.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038a3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(
  array['00000000-0000-0000-0000-0000000038e1']::uuid[], 'enviada_taller', null,
  '00000000-0000-0000-0000-0000000038b1') $$,
  'el admin envía la pieza al taller'
);
select results_eq(
  $$ select status::text from public.undo_piece_status('00000000-0000-0000-0000-0000000038e1', 'Aún no sale') $$,
  $$ values ('aprobada') $$,
  'el admin retrocede En restauración a Aprobada'
);
select results_eq(
  $$ select first_sent_at is null, last_sent_at is null, approved_at is not null
     from public.pieces where id = '00000000-0000-0000-0000-0000000038e1' $$,
  $$ values (true, true, true) $$,
  'las fechas del envío se limpian y la aprobación se conserva'
);

-- Anular y retroceder: la pieza se reactiva y vuelve a contar.
select lives_ok(
  $$ select * from public.change_piece_status(
  array['00000000-0000-0000-0000-0000000038e2']::uuid[], 'anulada', 'Cliente equivocado') $$,
  'se anula la otra pieza'
);
select results_eq(
  $$ select status::text from public.undo_piece_status('00000000-0000-0000-0000-0000000038e2', 'Se anuló por error') $$,
  $$ values ('aprobada') $$,
  'se reactiva una pieza anulada por error'
);
select is(
  (select cancelled_at from public.pieces where id = '00000000-0000-0000-0000-0000000038e2'),
  null::timestamptz,
  'la fecha de anulación se limpia'
);

select * from finish();
rollback;
