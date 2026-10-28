begin;

select plan(7);

-- Orden de la vista de piezas: por guía por defecto, o por fecha, precio o días en taller.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ea1', 'admin@orden.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-000000000ea2', 'ventas@orden.test', '{"role":"ventas"}', '{}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000ea20', 'persona', 'Eva');
insert into public.restorations (id, client_id, payment_type, created_at) values
  ('00000000-0000-0000-0000-00000000ea30', '00000000-0000-0000-0000-00000000ea20', 'contado', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000ea31', '00000000-0000-0000-0000-00000000ea20', 'contado', now() - interval '1 day');
-- Guía antigua: "uno" (S/ 100) y "dos" (urgente, sin precio). Guía nueva: "tres" (S/ 300).
insert into public.pieces (id, restoration_id, description, price, urgent, created_at, estimated_delivery_date) values
  ('00000000-0000-0000-0000-00000000ea41', '00000000-0000-0000-0000-00000000ea30', 'Ordenprueba uno', 100, false, now() - interval '3 hours', null),
  ('00000000-0000-0000-0000-00000000ea42', '00000000-0000-0000-0000-00000000ea30', 'Ordenprueba dos', null, true, now() - interval '2 hours', current_date + 5),
  ('00000000-0000-0000-0000-00000000ea43', '00000000-0000-0000-0000-00000000ea31', 'Ordenprueba tres', 300, false, now() - interval '1 hour', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea1","role":"authenticated"}', true);

select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba') $$,
  $$ values ('Ordenprueba tres'), ('Ordenprueba uno'), ('Ordenprueba dos') $$,
  'por defecto, la guía más reciente primero y sus piezas en orden (la urgente no sube)'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba', p_dir => 'asc') $$,
  $$ values ('Ordenprueba uno'), ('Ordenprueba dos'), ('Ordenprueba tres') $$,
  'por guía ascendente, la más antigua primero'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba', p_sort => 'precio') $$,
  $$ values ('Ordenprueba tres'), ('Ordenprueba uno'), ('Ordenprueba dos') $$,
  'por precio descendente, sin precio al final'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba', p_sort => 'precio', p_dir => 'asc') $$,
  $$ values ('Ordenprueba uno'), ('Ordenprueba tres'), ('Ordenprueba dos') $$,
  'por precio ascendente, sin precio también al final'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba', p_sort => 'fecha') $$,
  $$ values ('Ordenprueba tres'), ('Ordenprueba dos'), ('Ordenprueba uno') $$,
  'por fecha de registro, la más nueva primero'
);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba', p_sort => 'otro', p_dir => 'x') $$,
  $$ values ('Ordenprueba tres'), ('Ordenprueba uno'), ('Ordenprueba dos') $$,
  'un orden desconocido vuelve al orden por guía'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ea2","role":"authenticated"}', true);
select results_eq(
  $$ select description from public.list_pieces_board(p_query => 'Ordenprueba', p_sort => 'precio', p_dir => 'asc') $$,
  $$ values ('Ordenprueba uno'), ('Ordenprueba tres'), ('Ordenprueba dos') $$,
  'ventas también ordena por precio'
);

select * from finish();
rollback;
