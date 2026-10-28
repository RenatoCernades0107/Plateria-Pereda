begin;

select plan(22);
select set_config('app.deliver_with_balance', 'on', true);

-- Fecha estimada de entrega del taller (2026-10-27): opcional, nunca posterior a la
-- fecha de entrega al cliente.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000056a1', 'admin@taller-fecha.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000056a2', 'ventas@taller-fecha.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000056c1', 'persona', 'Rosa');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-0000000056d1', '00000000-0000-0000-0000-0000000056c1', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000056e1', '00000000-0000-0000-0000-0000000056d1', 'Fuente', 100),
  ('00000000-0000-0000-0000-0000000056e2', '00000000-0000-0000-0000-0000000056d1', 'Jarra', 100),
  ('00000000-0000-0000-0000-0000000056e3', '00000000-0000-0000-0000-0000000056d1', 'Plato', 100);

-- 1. La regla en la tabla.
select lives_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = private.lima_today() + 10
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  'se marca urgente sin fecha del taller (es opcional)'
);
select lives_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() + 10
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  'la fecha del taller puede ser el mismo día que la del cliente'
);
select throws_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() + 11
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'la fecha del taller no es posterior a la del cliente'
);
select throws_ok(
  $$ update public.pieces set estimated_delivery_date = private.lima_today() + 5
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'adelantar la fecha del cliente por delante de la del taller también se rechaza'
);
select throws_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() - 1
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  '23514', 'La fecha de entrega del taller no puede ser anterior a hoy.',
  'la fecha del taller no puede ser pasada'
);
select lives_ok(
  $$ update public.pieces set workshop_delivery_date = null
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  'la fecha del taller se puede borrar'
);
select lives_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() + 4
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  'y volver a llenar'
);
select lives_ok(
  $$ update public.pieces set urgent = false where id = '00000000-0000-0000-0000-0000000056e1' $$,
  'se quita la marca de urgente'
);
select is(
  (select workshop_delivery_date from public.pieces where id = '00000000-0000-0000-0000-0000000056e1'),
  null, 'al quitar urgente se borran las dos fechas'
);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description, urgent, estimated_delivery_date, workshop_delivery_date)
     values ('00000000-0000-0000-0000-0000000056d1', 'Copa', true,
             private.lima_today() + 2, private.lima_today() + 3) $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'una pieza nueva trae las fechas en orden'
);

-- 2. La RPC: ventas marca con las dos fechas, cambia solo una en bloque y la borra.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000056a2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000056e2']::uuid[], true,
       private.lima_today() + 9, private.lima_today() + 6) $$,
  'ventas marca urgente con fecha al cliente y del taller'
);
select results_eq(
  $$ select estimated_delivery_date - private.lima_today(), workshop_delivery_date - private.lima_today()
     from public.pieces_operational where id = '00000000-0000-0000-0000-0000000056e2' $$,
  $$ values (9, 6) $$,
  'la vista operativa trae las dos fechas'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000056e2', '00000000-0000-0000-0000-0000000056e3']::uuid[], true,
       private.lima_today() + 12, null, true) $$,
  'cambio en bloque de la fecha al cliente'
);
select results_eq(
  $$ select workshop_delivery_date - private.lima_today()
     from public.pieces where id = '00000000-0000-0000-0000-0000000056e2' $$,
  $$ values (6) $$,
  'en bloque, con la fecha del taller en blanco cada pieza conserva la suya'
);
select is(
  (select workshop_delivery_date from public.pieces where id = '00000000-0000-0000-0000-0000000056e3'),
  null, 'y la que no tenía sigue sin ella'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000056e2']::uuid[], true, private.lima_today() + 12) $$,
  'sin conservar, la fecha del taller en blanco la borra'
);
select is(
  (select workshop_delivery_date from public.pieces where id = '00000000-0000-0000-0000-0000000056e2'),
  null, 'la pieza queda sin fecha del taller'
);
select throws_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000056e2']::uuid[], true,
       private.lima_today() + 3, private.lima_today() + 5) $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'la RPC no deja la fecha del taller después de la del cliente'
);
select is(
  (select count(*)::int from public.list_pieces_board() b
   where b.id = '00000000-0000-0000-0000-0000000056e3' and b.estimated_delivery_date is not null
     and b.workshop_delivery_date is null),
  1, 'la vista de piezas devuelve las dos fechas'
);

-- 3. `service_role` (sincronizaciones, scripts, e2e) no ve el esquema `private`: la regla
--    tiene que correr igual con sus permisos.
reset role;
set local role service_role;
select lives_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = current_date + 30,
       workshop_delivery_date = current_date + 20
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  'service_role marca urgente con fechas'
);
select throws_ok(
  $$ update public.pieces set estimated_delivery_date = null
     where id = '00000000-0000-0000-0000-0000000056e1' $$,
  '23514', 'Una pieza urgente necesita fecha estimada de entrega.',
  'service_role tampoco deja una urgente sin fecha'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000056a1","role":"authenticated"}', true);

-- 4. Registrar una guía con las dos fechas.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000056a1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-0000000056c1', null, 'contado', null, '',
       jsonb_build_array(jsonb_build_object('description', 'Cuchara', 'urgent', true,
         'estimated_delivery_date', (private.lima_today() + 8)::text,
         'workshop_delivery_date', (private.lima_today() + 5)::text))) $$,
  'la guía se registra con las dos fechas'
);

select * from finish();
rollback;
