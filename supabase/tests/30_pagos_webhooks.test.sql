begin;

select plan(9);

insert into public.clients (id, kind, first_name, shopify_customer_id) values
  ('00000000-0000-0000-0000-00000000ff20', 'persona', 'Ana', 'gid://shopify/Customer/4420');
insert into public.clients (id, kind, legal_name, document_type, document_number, phone) values
  ('00000000-0000-0000-0000-00000000ff21', 'empresa', 'Platería SAC', 'ruc', '20100047218', '+5112345678');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000ff30', '00000000-0000-0000-0000-00000000ff20', 'contado'),
  ('00000000-0000-0000-0000-00000000ff31', '00000000-0000-0000-0000-00000000ff21', 'contado');

-- Cambio de cliente hecho en Shopify (D31).
select is(
  public.apply_shopify_order_customer('00000000-0000-0000-0000-00000000ff30',
    'gid://shopify/Customer/4420', 'Ana', '', null, null),
  false, 'el mismo cliente no cambia nada'
);
select is(
  public.apply_shopify_order_customer('00000000-0000-0000-0000-00000000ff30',
    'gid://shopify/Customer/4499', 'Luis', 'Rojas', 'luis@x.pe', null),
  true, 'otro cliente: la restauración pasa a él'
);
select results_eq(
  $$ select c.first_name, c.last_name, c.shopify_customer_id from public.restorations r
     join public.clients c on c.id = r.client_id where r.id = '00000000-0000-0000-0000-00000000ff30' $$,
  $$ values ('Luis', 'Rojas', 'gid://shopify/Customer/4499') $$,
  'y el cliente se crea localmente con su id de Shopify'
);
select is(
  public.apply_shopify_order_customer('00000000-0000-0000-0000-00000000ff31',
    'gid://shopify/Customer/4498', 'Eva', '', null, null),
  false, 'una restauración de empresa no cambia de cliente'
);

-- Encolar desde un webhook: una sola conciliación pendiente.
select public.enqueue_payment_sync('00000000-0000-0000-0000-00000000ff30');
select public.enqueue_payment_sync('00000000-0000-0000-0000-00000000ff30');
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where kind = 'payment.sync' and entity_id = '00000000-0000-0000-0000-00000000ff30'),
  1, 'webhooks repetidos encolan una sola conciliación'
);

-- Claim por entidad: lo que otro procesador tiene en curso no se toma.
delete from public.shopify_sync_jobs;
insert into public.shopify_sync_jobs (kind, entity_table, entity_id) values
  ('order.create', 'restorations', 'A'),
  ('payment.sync', 'restorations', 'A'),
  ('payment.sync', 'restorations', 'B');
select is(
  (select count(*)::int from public.claim_shopify_jobs(10)),
  3, 'en un lote van varios jobs de la misma entidad (se procesan en orden)'
);
update public.shopify_sync_jobs set status = 'pending', locked_at = null
where entity_id = 'A' and kind = 'payment.sync';
update public.shopify_sync_jobs set status = 'pending', locked_at = null where entity_id = 'B';
select results_eq(
  $$ select entity_id from public.claim_shopify_jobs(10) $$,
  $$ values ('B') $$,
  'con un job de A en curso en otro procesador, solo se toma B'
);
update public.shopify_sync_jobs set locked_at = now() - interval '10 minutes'
where entity_id = 'A' and kind = 'order.create';
select is(
  (select count(*)::int from public.claim_shopify_jobs(10) where entity_id = 'A'),
  2, 'un job abandonado ya no bloquea su entidad'
);

set local role authenticated;
select throws_ok(
  $$ select public.enqueue_payment_sync('00000000-0000-0000-0000-00000000ff30') $$,
  '42501', null, 'solo la clave secreta encola desde webhooks'
);

select * from finish();
rollback;
