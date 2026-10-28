begin;

select plan(32);
select set_config('app.deliver_with_balance', 'on', true);

-- Fecha estimada de entrega del taller (2026-10-27): por defecto 3 días antes de la del
-- cliente (sin pasar de hoy), nunca posterior a ella; solo admin y logística la cambian.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000058a1', 'admin@taller-fecha.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000058a2', 'ventas@taller-fecha.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000058a3', 'logistica@taller-fecha.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000058c1', 'persona', 'Rosa');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-0000000058d1', '00000000-0000-0000-0000-0000000058c1', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000058e1', '00000000-0000-0000-0000-0000000058d1', 'Fuente', 100),
  ('00000000-0000-0000-0000-0000000058e2', '00000000-0000-0000-0000-0000000058d1', 'Jarra', 100),
  ('00000000-0000-0000-0000-0000000058e3', '00000000-0000-0000-0000-0000000058d1', 'Plato', 100),
  ('00000000-0000-0000-0000-0000000058e4', '00000000-0000-0000-0000-0000000058d1', 'Copa', 100);

-- 1. La regla en la tabla (sin sesión de usuario: sin restricción por rol).
select lives_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = private.lima_today() + 10
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'se marca urgente sin indicar la fecha del taller'
);
select is(
  (select workshop_delivery_date - private.lima_today() from public.pieces
   where id = '00000000-0000-0000-0000-0000000058e1'),
  7, 'la fecha del taller queda 3 días antes de la del cliente'
);
select lives_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = private.lima_today() + 2
     where id = '00000000-0000-0000-0000-0000000058e2' $$,
  'se marca urgente con la entrega a 2 días'
);
select is(
  (select workshop_delivery_date - private.lima_today() from public.pieces
   where id = '00000000-0000-0000-0000-0000000058e2'),
  0, 'la fecha del taller por defecto no pasa de hoy'
);
select lives_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() + 10
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'la fecha del taller puede ser el mismo día que la del cliente'
);
select throws_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() + 11
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'la fecha del taller no es posterior a la del cliente'
);
select throws_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() - 1
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  '23514', 'La fecha de entrega del taller no puede ser anterior a hoy.',
  'la fecha del taller no puede ser pasada'
);
select lives_ok(
  $$ update public.pieces set estimated_delivery_date = private.lima_today() + 6
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'se adelanta la fecha del cliente por delante de la del taller'
);
select is(
  (select workshop_delivery_date - private.lima_today() from public.pieces
   where id = '00000000-0000-0000-0000-0000000058e1'),
  3, 'la fecha del taller se vuelve a calcular (3 días antes)'
);
select throws_ok(
  $$ update public.pieces set estimated_delivery_date = private.lima_today() + 5,
       workshop_delivery_date = private.lima_today() + 8
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'si se cambian las dos a la vez, la del taller sigue sin poder ser posterior'
);
select lives_ok(
  $$ update public.pieces set workshop_delivery_date = null
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'la fecha del taller se puede borrar'
);
select is(
  (select workshop_delivery_date from public.pieces where id = '00000000-0000-0000-0000-0000000058e1'),
  null, 'y queda en blanco (el valor por defecto solo se pone al marcar)'
);
select lives_ok(
  $$ update public.pieces set workshop_delivery_date = private.lima_today() + 4
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'y volver a llenar'
);
select lives_ok(
  $$ update public.pieces set urgent = false where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'se quita la marca de urgente'
);
select is(
  (select workshop_delivery_date from public.pieces where id = '00000000-0000-0000-0000-0000000058e1'),
  null, 'al quitar urgente se borran las dos fechas'
);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description, urgent, estimated_delivery_date, workshop_delivery_date)
     values ('00000000-0000-0000-0000-0000000058d1', 'Taza', true,
             private.lima_today() + 2, private.lima_today() + 3) $$,
  '23514', 'La fecha de entrega del taller no puede ser posterior a la del cliente.',
  'una pieza nueva trae las fechas en orden'
);

-- 2. Ventas marca urgente y cambia la fecha del cliente, pero no la del taller.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000058a2","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000058e3']::uuid[], true, private.lima_today() + 12, null, true) $$,
  'ventas marca urgente solo con la fecha del cliente'
);
select results_eq(
  $$ select estimated_delivery_date - private.lima_today(), workshop_delivery_date - private.lima_today()
     from public.pieces_operational where id = '00000000-0000-0000-0000-0000000058e3' $$,
  $$ values (12, 9) $$,
  'y la del taller queda 3 días antes'
);
select throws_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000058e3']::uuid[], true,
       private.lima_today() + 12, private.lima_today() + 5) $$,
  '42501', 'Solo administración y logística cambian la fecha de entrega del taller.',
  'ventas no cambia la fecha del taller'
);
select throws_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000058e3']::uuid[], true, private.lima_today() + 12) $$,
  '42501', 'Solo administración y logística cambian la fecha de entrega del taller.',
  'ni la borra'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000058e3']::uuid[], true, private.lima_today() + 5, null, true) $$,
  'ventas adelanta la fecha del cliente'
);
select results_eq(
  $$ select estimated_delivery_date - private.lima_today(), workshop_delivery_date - private.lima_today()
     from public.pieces where id = '00000000-0000-0000-0000-0000000058e3' $$,
  $$ values (5, 2) $$,
  'y la del taller se recalcula sola'
);

-- 3. Logística cambia la fecha del taller en un cambio en bloque o una por una.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000058a3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000058e3']::uuid[], true,
       private.lima_today() + 5, private.lima_today() + 4) $$,
  'logística cambia la fecha del taller'
);
select results_eq(
  $$ select workshop_delivery_date - private.lima_today() from public.pieces_operational
     where id = '00000000-0000-0000-0000-0000000058e3' $$,
  $$ values (4) $$,
  'queda la que puso'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000058e3', '00000000-0000-0000-0000-0000000058e4']::uuid[], true,
       private.lima_today() + 20, null, true) $$,
  'cambio en bloque de la fecha del cliente'
);
select results_eq(
  $$ select code, workshop_delivery_date - private.lima_today() from public.pieces_operational
     where id in ('00000000-0000-0000-0000-0000000058e3', '00000000-0000-0000-0000-0000000058e4')
     order by code $$,
  $$ select code, case id when '00000000-0000-0000-0000-0000000058e3' then 4 else 17 end
     from public.pieces_operational
     where id in ('00000000-0000-0000-0000-0000000058e3', '00000000-0000-0000-0000-0000000058e4')
     order by code $$,
  'en bloque, cada pieza conserva la suya y la que no tenía recibe la de por defecto'
);

-- 4. `service_role` (sincronizaciones, scripts, e2e) no ve el esquema `private`: la regla
--    tiene que correr igual con sus permisos.
reset role;
set local role service_role;
select lives_ok(
  $$ update public.pieces set urgent = true, estimated_delivery_date = current_date + 30,
       workshop_delivery_date = current_date + 20
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  'service_role marca urgente con fechas'
);
select throws_ok(
  $$ update public.pieces set estimated_delivery_date = null
     where id = '00000000-0000-0000-0000-0000000058e1' $$,
  '23514', 'Una pieza urgente necesita fecha estimada de entrega.',
  'service_role tampoco deja una urgente sin fecha'
);
reset role;
set local role authenticated;

-- 5. Registrar una guía: con las dos fechas, o solo con la del cliente (ventas no puede
--    mandar la del taller).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000058a1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-0000000058c1', null, 'contado', null, '',
       jsonb_build_array(jsonb_build_object('description', 'Cuchara', 'urgent', true,
         'estimated_delivery_date', (private.lima_today() + 8)::text,
         'workshop_delivery_date', (private.lima_today() + 5)::text))) $$,
  'admin registra la guía con las dos fechas'
);
select lives_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-0000000058c1', null, 'contado', null, '',
       jsonb_build_array(jsonb_build_object('description', 'Tenedor', 'urgent', true,
         'estimated_delivery_date', (private.lima_today() + 8)::text))) $$,
  'o solo con la del cliente'
);
select is(
  (select workshop_delivery_date - private.lima_today() from public.pieces where description = 'Tenedor'),
  5, 'y la del taller queda 3 días antes'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000058a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-0000000058c1', null, 'contado', null, '',
       jsonb_build_array(jsonb_build_object('description', 'Cuchillo', 'urgent', true,
         'estimated_delivery_date', (private.lima_today() + 8)::text,
         'workshop_delivery_date', (private.lima_today() + 5)::text))) $$,
  '42501', 'Solo administración y logística cambian la fecha de entrega del taller.',
  'ventas no registra una guía con la fecha del taller'
);

select * from finish();
rollback;
