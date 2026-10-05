begin;

select plan(5);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ba2', 'logistica@taller.test', '{"role":"logistica"}', '{}');
insert into public.workshops (id, name, active) values
  ('00000000-0000-0000-0000-00000000ba10', 'Taller Norte', true),
  ('00000000-0000-0000-0000-00000000ba11', 'Taller Cerrado', false);
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000ba20', 'persona', 'Ana', 'gid://shopify/Customer/ba20');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000ba30', '00000000-0000-0000-0000-00000000ba20', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000ba41', '00000000-0000-0000-0000-00000000ba30', 'Fuente', 100),
  ('00000000-0000-0000-0000-00000000ba42', '00000000-0000-0000-0000-00000000ba30', 'Bandeja', 50);
update public.pieces set status = 'enviada_taller' where id = '00000000-0000-0000-0000-00000000ba42';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ba2","role":"authenticated"}', true);

select is(
  public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ba41']::uuid[], '00000000-0000-0000-0000-00000000ba10'),
  1, 'logística asigna el taller'
);
reset role;
select is(
  (select count(*)::int from public.audit_log
   where record_id = '00000000-0000-0000-0000-00000000ba41' and changes ? 'workshop_id'),
  1, 'el cambio de taller queda auditado'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ba2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ba41']::uuid[], '00000000-0000-0000-0000-00000000ba11') $$,
  '23503', null, 'no se asigna un taller desactivado'
);
select throws_ok(
  $$ select public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ba42']::uuid[], '00000000-0000-0000-0000-00000000ba10') $$,
  '23514', null, 'una pieza que está en el taller no cambia de taller'
);
set local role anon;
select throws_ok(
  $$ select public.assign_piece_workshop(array['00000000-0000-0000-0000-00000000ba41']::uuid[], null) $$,
  '42501', null, 'un anónimo no asigna talleres'
);

select * from finish();
rollback;
