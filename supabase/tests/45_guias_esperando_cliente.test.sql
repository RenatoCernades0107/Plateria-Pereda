begin;

select plan(8);

-- Guías esperando respuesta del cliente (2026-10-19): filtro p_waiting_client y
-- cuántas piezas de cada guía están en Espera respuesta cliente (waiting_count).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000045a1', 'ventas@espera.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000045a2', 'logistica@espera.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000045c1', 'persona', 'Esperas', 'gid://shopify/Customer/45c1');

-- d1: dos piezas en espera y una registrada; d2: ninguna en espera (una anulada antes).
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000045d1', '00000000-0000-0000-0000-0000000045c1', 'contado'),
  ('00000000-0000-0000-0000-0000000045d2', '00000000-0000-0000-0000-0000000045c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, status) values
  ('00000000-0000-0000-0000-0000000045e1', '00000000-0000-0000-0000-0000000045d1', 'Fuente espera', 100, 'en_espera'),
  ('00000000-0000-0000-0000-0000000045e2', '00000000-0000-0000-0000-0000000045d1', 'Jarra espera', 100, 'en_espera'),
  ('00000000-0000-0000-0000-0000000045e3', '00000000-0000-0000-0000-0000000045d1', 'Vaso espera', null, 'registrada'),
  ('00000000-0000-0000-0000-0000000045e4', '00000000-0000-0000-0000-0000000045d2', 'Copa espera', null, 'registrada');

select has_function('public', 'list_restorations',
  array['text', 'restoration_status[]', 'payment_status[]', 'payment_type[]', 'uuid', 'uuid[]', 'date',
    'date', 'text', 'text', 'integer', 'integer', 'restoration_origin[]', 'text', 'boolean'],
  'list_restorations acepta p_waiting_client');
select hasnt_function('public', 'list_restorations',
  array['text', 'restoration_status[]', 'payment_status[]', 'payment_type[]', 'uuid', 'uuid[]', 'date',
    'date', 'text', 'text', 'integer', 'integer', 'restoration_origin[]', 'text'],
  'la firma anterior ya no existe');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000045a1","role":"authenticated"}', true);
select results_eq(
  $$ select id, waiting_count from public.list_restorations(
       p_client_id => '00000000-0000-0000-0000-0000000045c1', p_sort => 'created_at', p_dir => 'asc')
     order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000045d1'::uuid, 2), ('00000000-0000-0000-0000-0000000045d2'::uuid, 0) $$,
  'cada guía trae cuántas piezas esperan la respuesta del cliente'
);
select results_eq(
  $$ select id, waiting_count, total_count from public.list_restorations(
       p_client_id => '00000000-0000-0000-0000-0000000045c1', p_waiting_client => true) $$,
  $$ values ('00000000-0000-0000-0000-0000000045d1'::uuid, 2, 1::bigint) $$,
  'el filtro deja solo las guías con piezas en espera (y el total, para paginar)'
);
select is(
  (select count(*)::int from public.list_restorations(
     p_client_id => '00000000-0000-0000-0000-0000000045c1', p_waiting_client => false)),
  2, 'sin el filtro salen todas'
);
select is(
  (select count(*)::int from public.list_restorations(
     p_client_id => '00000000-0000-0000-0000-0000000045c1', p_waiting_client => true,
     p_limit => 1, p_offset => 1)),
  0, 'el filtro se aplica antes de paginar'
);

-- Logística también ve el contador y usa el filtro (no es dinero).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000045a2","role":"authenticated"}', true);
select results_eq(
  $$ select id, waiting_count from public.list_restorations(
       p_client_id => '00000000-0000-0000-0000-0000000045c1', p_waiting_client => true) $$,
  $$ values ('00000000-0000-0000-0000-0000000045d1'::uuid, 2) $$,
  'logística filtra y cuenta las piezas en espera'
);

-- Al responder el cliente, la guía sale del filtro.
reset role;
update public.pieces set status = 'aprobada', approved_at = now()
where restoration_id = '00000000-0000-0000-0000-0000000045d1' and status = 'en_espera';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000045a1","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_restorations(
     p_client_id => '00000000-0000-0000-0000-0000000045c1', p_waiting_client => true)),
  0, 'sin piezas en espera la guía ya no sale con el filtro'
);

select * from finish();
rollback;
