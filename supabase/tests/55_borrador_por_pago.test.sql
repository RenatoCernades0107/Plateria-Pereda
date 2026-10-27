begin;

select plan(4);

-- Borrador de Shopify de cada pago (el empleado lo convierte en pedido).
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-000000055c01', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-000000055f01', '00000000-0000-0000-0000-000000055c01', 'contado');
insert into public.pieces (id, restoration_id, description, price, quantity, approved_at, status)
  values ('00000000-0000-0000-0000-000000055b01', '00000000-0000-0000-0000-000000055f01', 'Copa', 100, 1, now(), 'aprobada');

insert into public.payments (id, restoration_id, amount, method_name) values
  ('00000000-0000-0000-0000-000000055d01', '00000000-0000-0000-0000-000000055f01', 30, 'Efectivo'),
  ('00000000-0000-0000-0000-000000055d02', '00000000-0000-0000-0000-000000055f01', 20, 'Efectivo');

select is(
  (select count(*)::int from public.payments
   where restoration_id = '00000000-0000-0000-0000-000000055f01'
     and shopify_draft_order_id is null and shopify_draft_order_name is null),
  2, 'un pago nuevo no trae borrador hasta que el job lo crea'
);

update public.payments
set shopify_draft_order_id = 'gid://shopify/DraftOrder/55', shopify_draft_order_name = '#D55'
where id = '00000000-0000-0000-0000-000000055d01';

select is(
  (select shopify_draft_order_name from public.payments where id = '00000000-0000-0000-0000-000000055d01'),
  '#D55', 'el pago guarda su borrador'
);

select throws_ok(
  $$update public.payments set shopify_draft_order_id = 'gid://shopify/DraftOrder/55'
    where id = '00000000-0000-0000-0000-000000055d02'$$,
  '23505', null, 'un borrador pertenece a un solo pago'
);

select is(
  (select count(*)::int from public.payments
   where shopify_draft_order_id = 'gid://shopify/DraftOrder/55'),
  1, 'se encuentra el pago por su borrador (webhook draft_orders/update)'
);

select * from finish();
rollback;
