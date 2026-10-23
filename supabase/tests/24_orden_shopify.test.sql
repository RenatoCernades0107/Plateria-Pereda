begin;

select plan(3);

-- Ya no se crea la orden con las piezas (un pedido de Shopify por pago, ver
-- 54_ordenes_por_pago): aprobar todas las piezas no encola `order.create`.
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-000000024c01', 'persona', 'Ana', 'gid://shopify/Customer/2401');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-000000024f01', '00000000-0000-0000-0000-000000024c01', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-000000024a01', '00000000-0000-0000-0000-000000024f01', 'Fuente', 100),
  ('00000000-0000-0000-0000-000000024a02', '00000000-0000-0000-0000-000000024f01', 'Jarra', 50);

create function pg_temp.order_jobs() returns integer language sql as $$
  select count(*)::integer from public.shopify_sync_jobs
  where kind = 'order.create' and entity_id = '00000000-0000-0000-0000-000000024f01';
$$;

update public.pieces set status = 'aprobada', approved_at = now()
  where id = '00000000-0000-0000-0000-000000024a01';
select is(pg_temp.order_jobs(), 0, 'con una pieza sin aprobar no se encola la orden');

update public.pieces set status = 'aprobada', approved_at = now()
  where id = '00000000-0000-0000-0000-000000024a02';
select is(pg_temp.order_jobs(), 0, 'con todas aprobadas tampoco: ya no hay orden con las piezas');
select is(
  (select status::text from public.restorations where id = '00000000-0000-0000-0000-000000024f01'),
  'aprobada', 'la restauración queda Aprobada'
);

select * from finish();
rollback;
