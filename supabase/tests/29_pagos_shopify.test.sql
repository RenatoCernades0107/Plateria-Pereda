begin;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ee1', 'ventas@pagos2.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000ee2', 'logistica@pagos2.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000ee20', 'persona', 'Ana');
-- ee30: sin orden; ee40: con orden y una pieza lista para entregar; ee50: al crédito.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000ee30', '00000000-0000-0000-0000-00000000ee20', 'contado'),
  ('00000000-0000-0000-0000-00000000ee40', '00000000-0000-0000-0000-00000000ee20', 'contado'),
  ('00000000-0000-0000-0000-00000000ee50', '00000000-0000-0000-0000-00000000ee20', 'credito');
insert into public.pieces (id, restoration_id, description, price, approved_at, status, arrived_at,
    first_sent_at, last_sent_at, last_returned_at) values
  ('00000000-0000-0000-0000-00000000ee31', '00000000-0000-0000-0000-00000000ee30', 'Fuente', 100, now(), 'aprobada',
    now(), null, null, null),
  ('00000000-0000-0000-0000-00000000ee41', '00000000-0000-0000-0000-00000000ee40', 'Copa', 100, now(), 'enviada_taller',
    now(), now() - interval '2 days', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ee42', '00000000-0000-0000-0000-00000000ee40', 'Jarra', 50, now(), 'enviada_taller',
    now(), now() - interval '2 days', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ee51', '00000000-0000-0000-0000-00000000ee50', 'Bandeja', 80, now(), 'enviada_taller',
    now(), now() - interval '2 days', now() - interval '2 days', now() - interval '1 day');
update public.restorations set shopify_order_id = 'gid://shopify/Order/ee40', shopify_order_name = '#1001'
where id = '00000000-0000-0000-0000-00000000ee40';

create temporary view sync_jobs as
  select entity_id from public.shopify_sync_jobs where kind = 'payment.sync' and status = 'pending';
grant select on sync_jobs to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ee1","role":"authenticated"}', true);

-- Envío a Shopify.
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-00000000ee30', 50, 'Yape');
select is((select count(*)::int from sync_jobs), 0, 'sin orden, el pago no encola nada (irá al crear la orden)');
select is(
  (select shopify_synced_at from public.payments where restoration_id = '00000000-0000-0000-0000-00000000ee30'),
  null, 'y queda pendiente de envío'
);
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-00000000ee40', 50, 'Efectivo');
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-00000000ee40', 20, 'Efectivo');
select results_eq(
  $$ select entity_id from sync_jobs $$,
  $$ values ('00000000-0000-0000-0000-00000000ee40') $$,
  'con la orden, el pago encola una sola conciliación pendiente'
);
reset role;
insert into public.payments (restoration_id, amount, method_name, source, shopify_transaction_id)
  values ('00000000-0000-0000-0000-00000000ee40', 10, 'shopify_payments', 'shopify', 'gid://shopify/OrderTransaction/1');
select isnt(
  (select shopify_synced_at from public.payments where source = 'shopify'),
  null, 'un pago que vino de Shopify ya está allá'
);

-- P45: entrega con saldo pendiente.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ee2","role":"authenticated"}', true);
select results_eq(
  $$ select balance_due from public.restorations_balance_due(array['00000000-0000-0000-0000-00000000ee40'::uuid,
       '00000000-0000-0000-0000-00000000ee50'::uuid]) order by restoration_id $$,
  $$ values (true), (false) $$,
  'logística sabe si falta cobrar, sin montos (al crédito no cuenta)'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ee41']::uuid[], 'entregada') $$,
  '23514', 'Falta cobrar el saldo', 'logística no entrega con saldo pendiente'
);
select throws_ok(
  $$ select * from public.deliver_pieces_with_balance(array['00000000-0000-0000-0000-00000000ee41']::uuid[]) $$,
  '42501', null, 'ni confirmándolo'
);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ee51']::uuid[], 'entregada') $$,
  'al crédito se entrega con saldo'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ee1","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ee41']::uuid[], 'entregada') $$,
  '23514', 'Falta cobrar el saldo', 'ventas tampoco sin confirmarlo'
);
select lives_ok(
  $$ select * from public.deliver_pieces_with_balance(array['00000000-0000-0000-0000-00000000ee41']::uuid[], 'Cliente de confianza') $$,
  'ventas entrega confirmándolo'
);
select is(
  (select note from public.piece_status_history
   where piece_id = '00000000-0000-0000-0000-00000000ee41' and to_status = 'entregada'),
  'Entregada con saldo pendiente: Cliente de confianza', 'queda dicho en el historial'
);
select is(
  current_setting('app.deliver_with_balance', true), '',
  'la confirmación no sigue activa después'
);
select throws_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ee42']::uuid[], 'entregada') $$,
  '23514', 'Falta cobrar el saldo', 'la siguiente entrega vuelve a pedirla'
);

-- Pagado el saldo, se entrega sin confirmar.
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-00000000ee40', 70, 'Efectivo');
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000ee42']::uuid[], 'entregada') $$,
  'sin saldo se entrega normalmente'
);

-- Nombre en Shopify del método de pago (D34).
reset role;
select has_column('public', 'payment_methods', 'shopify_name', 'los métodos tienen su nombre en Shopify');

select * from finish();
rollback;
