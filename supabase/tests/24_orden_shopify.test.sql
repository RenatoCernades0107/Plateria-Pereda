begin;

select plan(5);

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
select is(pg_temp.order_jobs(), 1, 'con todas aprobadas se encola la orden');

-- El job falla: los cambios siguientes no encolan otro (se usa "Reintentar").
update public.shopify_sync_jobs set status = 'error', last_error = 'x'
  where entity_id = '00000000-0000-0000-0000-000000024f01';
update public.pieces set notes = 'nota', status = 'aprobada', approved_at = now()
  where id = '00000000-0000-0000-0000-000000024a01';
select is(pg_temp.order_jobs(), 1, 'un job con error no se duplica');

-- El handler lo omitió porque la restauración dejó de estar lista: se encola de nuevo
-- cuando vuelve a estarlo.
update public.shopify_sync_jobs set status = 'ok', result = '{"skipped": true}'
  where entity_id = '00000000-0000-0000-0000-000000024f01';
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-000000024a03', '00000000-0000-0000-0000-000000024f01', 'Plato', 10);
select is(pg_temp.order_jobs(), 1, 'una pieza nueva sin aprobar no encola la orden');
update public.pieces set status = 'aprobada', approved_at = now()
  where id = '00000000-0000-0000-0000-000000024a03';
select is(pg_temp.order_jobs(), 2, 'tras un job omitido se encola otra vez al aprobar');

select * from finish();
rollback;
