begin;

select plan(30);

-- Tipo de guía (2026-10-17): normal, interna u observada. Las dos últimas no se cobran:
-- sin precio de venta, sin pagos ni adelanto y sin orden de Shopify.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000041a1', 'ventas@tipo.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000041a2', 'logistica@tipo.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-0000000041a3', 'admin@tipo.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000041c1', 'persona', 'Tina', 'gid://shopify/Customer/41c1');
insert into public.workshops (id, name) values ('00000000-0000-0000-0000-0000000041b1', 'Taller Tipo');

create temporary table created (label text primary key, id uuid);
grant all on created to authenticated;
create temporary view order_jobs as
  select entity_id from public.shopify_sync_jobs where kind = 'order.create';
grant select on order_jobs to authenticated;

-- Interna: ventas la registra con precio y adelanto, que se ignoran.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}', true);
insert into created
select 'interna', id from public.create_restoration(
  '00000000-0000-0000-0000-0000000041c1', null, 'a_cuenta', 50, 'Piezas de la vitrina',
  '[{"description": "Bandeja de vitrina", "price": 300, "quantity": 2}, {"description": "Jarra de vitrina"}]',
  100, 'interno');
select results_eq(
  $$ select r.kind::text, r.payment_type::text, r.deposit_percent, r.deposit_amount, r.status::text
     from public.restorations r join created c on c.id = r.id where c.label = 'interna' $$,
  $$ values ('interno', 'sin_definir', null::numeric, null::numeric, 'aprobada') $$,
  'guía interna: sin cobro (tipo de pago Sin definir, sin adelanto) y Aprobada'
);
select results_eq(
  $$ select p.status::text, p.approved_at is not null, p.price, p.quantity, p.location::text
     from public.pieces p join created c on c.id = p.restoration_id where c.label = 'interna' order by p.number $$,
  $$ values ('aprobada', true, null::numeric, 2, 'sin_enviar'), ('aprobada', true, null::numeric, 1, 'sin_enviar') $$,
  'sus piezas nacen Aprobadas, sin precio (no pasan a Consulta) y con su cantidad'
);
select is(
  (select count(*)::int from order_jobs where entity_id = (select id::text from created where label = 'interna')),
  0, 'una guía interna no encola la orden de Shopify'
);

-- Observada.
insert into created
select 'observada', id from public.create_restoration(
  '00000000-0000-0000-0000-0000000041c1', null, 'contado', null, 'Reclamo',
  '[{"description": "Copa con rayas", "price": 80}]', null, 'observado');
select results_eq(
  $$ select r.kind::text, r.payment_type::text, r.status::text
     from public.restorations r join created c on c.id = r.id where c.label = 'observada' $$,
  $$ values ('observado', 'sin_definir', 'registrada') $$,
  'guía observada: sin cobro y Registrada como estado general'
);
select results_eq(
  $$ select p.status::text, p.observed_at is not null, p.price, p.service_cost, p.location::text
     from public.pieces p join created c on c.id = p.restoration_id where c.label = 'observada' $$,
  $$ values ('observada', true, null::numeric, null::numeric, 'sin_enviar') $$,
  'sus piezas nacen Observadas, sin precio ni costo, Sin enviar'
);

-- Agregar una pieza sigue la misma regla.
insert into public.pieces (restoration_id, description, price)
select id, 'Plato de vitrina', null from created where label = 'interna';
insert into public.pieces (restoration_id, description)
select id, 'Vaso con reclamo' from created where label = 'observada';
select results_eq(
  $$ select p.description, p.status::text from public.pieces p
     where p.description in ('Plato de vitrina', 'Vaso con reclamo') order by p.description $$,
  $$ values ('Plato de vitrina', 'aprobada'), ('Vaso con reclamo', 'observada') $$,
  'una pieza agregada nace según el tipo de la guía'
);

-- Sin precio, sin costo (observada), sin pagos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a3","role":"authenticated"}', true);
select throws_ok(
  $$ update public.pieces set price = 50
     where restoration_id = (select id from created where label = 'interna') $$,
  '23514', 'Una guía interna u observada no lleva precio de venta.',
  'ni el admin pone precio en una guía interna'
);
select throws_ok(
  $$ select public.set_piece_service_cost(
       (select p.id from public.pieces p join created c on c.id = p.restoration_id
        where c.label = 'observada' order by p.number limit 1), 20) $$,
  '23514', 'Una guía observada no lleva costo de servicio.',
  'una guía observada no lleva costo de servicio'
);
select lives_ok(
  $$ select public.set_piece_service_cost(
       (select p.id from public.pieces p join created c on c.id = p.restoration_id
        where c.label = 'interna' order by p.number limit 1), 20) $$,
  'una guía interna sí lleva costo de servicio'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, amount, method_name)
     select id, 10, 'Efectivo' from created where label = 'interna' $$,
  '23514', 'Una guía interna u observada no recibe pagos.',
  'una guía interna no recibe pagos'
);

-- El tipo solo cambia con set_restoration_kind.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}', true);
select throws_ok(
  $$ update public.restorations set kind = 'normal' where id = (select id from created where label = 'interna') $$,
  '42501', null, 'el tipo no se cambia con un update directo'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_restoration_kind((select id from created where label = 'interna'), 'normal') $$,
  '42501', 'Tu rol no puede cambiar el tipo de guía.', 'logística no cambia el tipo de guía'
);

-- Normal → Interna: las piezas por aprobar pasan a Aprobada y se vacía el precio.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a3","role":"authenticated"}', true);
insert into created
select 'normal', id from public.create_restoration(
  '00000000-0000-0000-0000-0000000041c1', null, 'a_cuenta', null, '',
  '[{"description": "Fuente con precio", "price": 120}, {"description": "Azucarera sin precio"}]', 30);
select results_eq(
  $$ select p.status::text, p.price from public.pieces p join created c on c.id = p.restoration_id
     where c.label = 'normal' order by p.number $$,
  $$ values ('registrada', 120.00::numeric), ('en_consulta', null::numeric) $$,
  'guía normal: la pieza sin precio pasa a Consulta'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}', true);
select is(
  public.set_restoration_kind((select id from created where label = 'normal'), 'interno')::text,
  'interno', 'ventas cambia la guía a interna'
);
select results_eq(
  $$ select p.status::text, p.price, p.approved_at is not null from public.pieces p
     join created c on c.id = p.restoration_id where c.label = 'normal' order by p.number $$,
  $$ values ('aprobada', null::numeric, true), ('aprobada', null::numeric, true) $$,
  'las piezas por aprobar quedan Aprobadas y sin precio'
);
select results_eq(
  $$ select r.kind::text, r.payment_type::text, r.deposit_amount, r.status::text, r.total
     from public.restorations r join created c on c.id = r.id where c.label = 'normal' $$,
  $$ values ('interno', 'sin_definir', null::numeric, 'aprobada', 0.00::numeric) $$,
  'la guía queda interna, sin cobro, Aprobada y con total 0'
);
reset role;
select results_eq(
  $$ select h.from_status::text, h.note from public.piece_status_history h
     join public.pieces p on p.id = h.piece_id join created c on c.id = p.restoration_id
     where c.label = 'normal' and h.to_status = 'aprobada' and h.event = 'estado' order by p.number $$,
  $$ values ('registrada', 'Guía interna'), ('en_consulta', 'Guía interna') $$,
  'el cambio de estado queda en el historial con la nota'
);
select is(
  (select count(*)::int from public.audit_log
   where record_id = (select id::text from created where label = 'normal') and action = 'update'
     and changes ? 'kind'),
  1, 'el cambio de tipo queda auditado'
);
select is(
  (select count(*)::int from order_jobs
   where entity_id in (select id::text from created)),
  0, 'ninguna guía interna u observada encola la orden de Shopify'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}', true);
select is(
  public.set_restoration_kind((select id from created where label = 'normal'), 'interno')::text,
  'interno', 'el mismo tipo no cambia nada'
);

-- Interna → Normal: las piezas quedan como están; el admin asigna precios y se encola
-- la orden.
select is(
  public.set_restoration_kind((select id from created where label = 'normal'), 'normal')::text,
  'normal', 'vuelve a ser normal'
);
select results_eq(
  $$ select p.status::text, p.price from public.pieces p join created c on c.id = p.restoration_id
     where c.label = 'normal' order by p.number $$,
  $$ values ('aprobada', null::numeric), ('aprobada', null::numeric) $$,
  'las piezas quedan como estaban'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a3","role":"authenticated"}', true);
update public.pieces set price = 70
where restoration_id = (select id from created where label = 'normal');
select is(
  (select count(*)::int from order_jobs where entity_id = (select id::text from created where label = 'normal')),
  0, 'normal otra vez y con precios: ya no se crea la orden con las piezas (un pedido por pago)'
);

-- Normal → Observada: todas las vivas pasan a Observada, sin precio ni costo.
insert into created
select 'reclamo', id from public.create_restoration(
  '00000000-0000-0000-0000-0000000041c1', null, 'contado', null, '',
  '[{"description": "Tetera aprobada", "price": 200}, {"description": "Cofre en consulta"}]');
select lives_ok(
  $$ select * from public.change_piece_status(
       (select array_agg(p.id) from public.pieces p join created c on c.id = p.restoration_id
        where c.label = 'reclamo' and p.status = 'registrada'), 'aprobada') $$,
  'se aprueba una pieza'
);
reset role;
update public.pieces set service_cost = 40
where restoration_id = (select id from created where label = 'reclamo');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}', true);
select is(
  public.set_restoration_kind((select id from created where label = 'reclamo'), 'observado')::text,
  'observado', 'ventas cambia la guía a observada'
);
reset role;
select results_eq(
  $$ select p.status::text, p.price, p.service_cost, p.observed_at is not null, p.approved_at from public.pieces p
     join created c on c.id = p.restoration_id where c.label = 'reclamo' order by p.number $$,
  $$ values ('observada', null::numeric, null::numeric, true, null::timestamptz),
            ('observada', null::numeric, null::numeric, true, null::timestamptz) $$,
  'todas las vivas quedan Observadas, sin precio, costo ni aprobación'
);
select is(
  (select status::text from public.restorations where id = (select id from created where label = 'reclamo')),
  'registrada', 'el estado general se recalcula (Registrada)'
);

-- Bloqueos: pagos, orden de Shopify, piezas que fueron al taller.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000041d1', '00000000-0000-0000-0000-0000000041c1', 'contado'),
  ('00000000-0000-0000-0000-0000000041d2', '00000000-0000-0000-0000-0000000041c1', 'contado'),
  ('00000000-0000-0000-0000-0000000041d3', '00000000-0000-0000-0000-0000000041c1', 'contado');
insert into public.pieces (restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000041d1', 'Con pago', 100),
  ('00000000-0000-0000-0000-0000000041d2', 'Con orden', 100),
  ('00000000-0000-0000-0000-0000000041d3', 'Fue al taller', 100);
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-0000000041d1', 10, 'Efectivo');
update public.restorations set shopify_order_id = 'gid://shopify/Order/41d2'
  where id = '00000000-0000-0000-0000-0000000041d2';
update public.pieces set status = 'aprobada', approved_at = now(), first_sent_at = now(), last_sent_at = now(),
  workshop_id = '00000000-0000-0000-0000-0000000041b1'
  where restoration_id = '00000000-0000-0000-0000-0000000041d3';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000041a3","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_restoration_kind('00000000-0000-0000-0000-0000000041d1', 'interno') $$,
  '23514', 'La guía tiene pagos registrados: no se puede cambiar su tipo.', 'con pagos no cambia el tipo'
);
select throws_ok(
  $$ select public.set_restoration_kind('00000000-0000-0000-0000-0000000041d2', 'interno') $$,
  '23514', 'La guía ya tiene orden de Shopify: no se puede cambiar su tipo.', 'con orden no cambia el tipo'
);
select throws_ok(
  $$ select public.set_restoration_kind('00000000-0000-0000-0000-0000000041d3', 'observado') $$,
  '23514', 'Solo se cambia el tipo de una guía en la que ninguna pieza fue al taller ni se entregó.',
  'si una pieza fue al taller no cambia el tipo'
);

select * from finish();
rollback;
