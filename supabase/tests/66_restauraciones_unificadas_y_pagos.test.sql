begin;

select plan(14);

-- Restauraciones en una sola vista (las terminadas al final) y vista de pagos (2026-11-03).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000066a1', 'ventas@unificadas.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000066a2', 'logistica@unificadas.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');
insert into public.clients (id, kind, first_name, phone, email, shopify_customer_id)
  values ('00000000-0000-0000-0000-0000000066c1', 'persona', 'Unificada', '+51987666001', 'uni@ficada.test',
    'gid://shopify/Customer/66c1');

-- d1: vigente; d2: anulada hace días (terminada). d2 tiene el código más alto.
insert into public.restorations (id, client_id, payment_type, created_by) values
  ('00000000-0000-0000-0000-0000000066d1', '00000000-0000-0000-0000-0000000066c1', 'contado',
   '00000000-0000-0000-0000-0000000066a1'),
  ('00000000-0000-0000-0000-0000000066d2', '00000000-0000-0000-0000-0000000066c1', 'contado', null);
insert into public.pieces (id, restoration_id, description, price, status) values
  ('00000000-0000-0000-0000-0000000066e1', '00000000-0000-0000-0000-0000000066d1', 'Fuente unificada', 100, 'registrada'),
  ('00000000-0000-0000-0000-0000000066e2', '00000000-0000-0000-0000-0000000066d2', 'Jarra unificada', 100, 'registrada');
update public.pieces set status = 'anulada', cancelled_at = now() - interval '3 days'
  where id = '00000000-0000-0000-0000-0000000066e2';
update public.restorations set status = 'anulada' where id = '00000000-0000-0000-0000-0000000066d2';

insert into public.payments (id, restoration_id, kind, amount, method_name, paid_on, created_by_name) values
  ('00000000-0000-0000-0000-0000000066f1', '00000000-0000-0000-0000-0000000066d1', 'pago', 60, 'Yape Unificado', '2025-05-02', 'x'),
  ('00000000-0000-0000-0000-0000000066f2', '00000000-0000-0000-0000-0000000066d1', 'pago', 40, 'Efectivo Unificado', '2025-05-04', 'x');
insert into public.payments (restoration_id, kind, amount, method_name, paid_on, reason, refunded_payment_id, created_by_name) values
  ('00000000-0000-0000-0000-0000000066d1', 'reembolso', 10, 'Efectivo Unificado', '2025-05-05', 'Devolución',
   '00000000-0000-0000-0000-0000000066f2', 'x');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000066a1","role":"authenticated"}', true);

-- 1. Una sola vista: con 'todas' salen las dos, la terminada al final aunque el orden la
--    pondría primero (código descendente).
select is(
  (select array_agg(id::text order by ord) from (
     select id, row_number() over () as ord from public.list_restorations(
       p_client_id => '00000000-0000-0000-0000-0000000066c1', p_scope => 'todas', p_sort => 'code', p_dir => 'desc')
   ) t),
  array['00000000-0000-0000-0000-0000000066d1', '00000000-0000-0000-0000-0000000066d2'],
  'las terminadas van al final con cualquier orden'
);
select is(
  (select is_archived from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000066c1')
   where id = '00000000-0000-0000-0000-0000000066d2'),
  true, 'la anulada viene marcada como terminada'
);
select is(
  (select count(*)::int from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000066c1',
     p_scope => 'activas')),
  1, 'activas sigue sin las terminadas (kanban)'
);

-- 2. Columnas del CSV.
select is(
  (select row(client_phone, client_email, refunded, last_paid_on, created_by_name)::text
   from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000066c1')
   where id = '00000000-0000-0000-0000-0000000066d1'),
  row('+51987666001', 'uni@ficada.test', 10.00::numeric, '2025-05-04'::date, 'Vera Ventas')::text,
  'trae teléfono, email, reembolsado, último pago y quién la registró'
);
select ok(
  (select finished_at is not null from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000066c1')
   where id = '00000000-0000-0000-0000-0000000066d2'),
  'la terminada trae su fecha de cierre'
);

-- 3. Pagos de todas las restauraciones.
select is(
  (select count(*)::int from public.list_payments(p_query => 'Unificada')),
  3, 'list_payments trae pagos y reembolsos, buscando por cliente'
);
select is(
  (select row(total_count, total_paid, total_refunded)::text from public.list_payments(p_query => 'Unificada') limit 1),
  row(3::bigint, 100.00::numeric, 10.00::numeric)::text,
  'con el total de filas, lo cobrado y lo reembolsado de lo filtrado'
);
select is(
  (select array_agg(amount order by ord) from (
     select amount, row_number() over () as ord from public.list_payments(p_query => 'Unificada')) t),
  array[10.00, 40.00, 60.00]::numeric[],
  'del más reciente al más antiguo'
);
select is(
  (select count(*)::int from public.list_payments(p_query => 'Unificada',
     p_kind => array['reembolso']::public.payment_kind[])),
  1, 'filtra por tipo'
);
select is(
  (select count(*)::int from public.list_payments(p_query => 'Unificada', p_methods => array['Yape Unificado'])),
  1, 'filtra por método'
);
select is(
  (select count(*)::int from public.list_payments(p_query => 'Unificada', p_from => '2025-05-03', p_to => '2025-05-04')),
  1, 'filtra por fecha de pago'
);
select ok(
  'Yape Unificado' = any (array(select public.payment_method_names())),
  'los métodos usados salen para el filtro'
);

-- 4. Logística no ve pagos ni datos de contacto.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000066a2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_payments(p_query => 'Unificada')),
  0, 'logística no ve los pagos'
);
select is(
  (select row(client_phone, client_email, refunded)::text
   from public.list_restorations(p_client_id => '00000000-0000-0000-0000-0000000066c1')
   where id = '00000000-0000-0000-0000-0000000066d1'),
  row(null::text, null::text, null::numeric)::text,
  'logística no ve teléfono, email ni montos'
);

select * from finish();
rollback;
