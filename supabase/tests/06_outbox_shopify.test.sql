begin;

select plan(11);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'admin@outbox.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'ventas@outbox.test', '{"role":"ventas"}', '{}');

-- Aísla la prueba de jobs que hayan dejado otros tests.
delete from public.shopify_sync_jobs;

select ok(
  private.enqueue_shopify_job('customer.create', 'clients', 'c1', '{"a":1}', 'cliente-c1') is not null,
  'encola un job'
);
select is(
  private.enqueue_shopify_job('customer.create', 'clients', 'c1', '{"a":2}', 'cliente-c1'),
  (select id from public.shopify_sync_jobs where idempotency_key = 'cliente-c1'),
  'con la misma clave pendiente devuelve el job existente'
);
select private.enqueue_shopify_job('order.create', 'restorations', 'r1');
insert into public.shopify_sync_jobs (kind, entity_table, entity_id, next_attempt_at)
  values ('order.create', 'restorations', 'r-futuro', now() + interval '1 hour');
insert into public.shopify_sync_jobs (kind, entity_table, entity_id, status, locked_at)
  values ('order.create', 'restorations', 'r-colgado', 'processing', now() - interval '10 minutes');

-- Lectura
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select is((select count(*)::int from public.shopify_sync_jobs), 4, 'admin lee el outbox');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select is((select count(*)::int from public.shopify_sync_jobs), 0, 'ventas no lee el outbox');
select throws_ok(
  $$ update public.shopify_sync_jobs set status = 'ok' $$,
  '42501', null, 'los usuarios no modifican el outbox'
);
select throws_ok(
  $$ select * from public.claim_shopify_jobs() $$,
  '42501', null, 'los usuarios no toman jobs'
);
select throws_ok(
  $$ select private.enqueue_shopify_job('x.y', 't', '1') $$,
  '42501', null, 'los usuarios no encolan jobs directamente'
);
reset role;
set local role anon;
select throws_ok($$ select * from public.shopify_sync_jobs $$, '42501', null, 'un anónimo no lee el outbox');
reset role;

-- El procesador (clave secreta) toma los vencidos y los colgados, no los futuros.
set local role service_role;
select results_eq(
  $$ select entity_id, status, attempts from public.claim_shopify_jobs(10) order by entity_id $$,
  $$ values ('c1', 'processing', 1), ('r-colgado', 'processing', 1), ('r1', 'processing', 1) $$,
  'toma los jobs vencidos y los abandonados, y suma un intento'
);
select is(
  (select count(*)::int from public.claim_shopify_jobs(10)),
  0,
  'un job tomado no se vuelve a tomar mientras se procesa'
);
reset role;
select is(
  (select status from public.shopify_sync_jobs where entity_id = 'r-futuro'),
  'pending',
  'un job con reintento futuro espera su turno'
);

select * from finish();
rollback;
