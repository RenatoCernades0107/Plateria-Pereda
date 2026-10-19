begin;

select plan(11);

-- Varios servicios por pieza: la pieza guarda sus servicios en `service_ids` y la BD
-- deriva `service_id` (el primero) y `service_name` (los nombres juntos).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fc1', 'ventas@servicios.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000fc2', 'admin@servicios.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000fc20', 'persona', 'Servicios');
insert into public.services (id, name, active) values
  ('00000000-0000-0000-0000-00000000fc41', 'Pulido múltiple', true),
  ('00000000-0000-0000-0000-00000000fc42', 'Grabado múltiple', true),
  ('00000000-0000-0000-0000-00000000fc43', 'Baño múltiple', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fc1","role":"authenticated"}', true);

-- 1. Varios servicios al registrar la restauración: sin repetidos y en el orden elegido.
create temporary table r as
  select * from public.create_restoration('00000000-0000-0000-0000-00000000fc20', null, 'contado', null, '',
    '[{"description":"Dos servicios",
       "service_ids":["00000000-0000-0000-0000-00000000fc42","00000000-0000-0000-0000-00000000fc41","00000000-0000-0000-0000-00000000fc42"]},
      {"description":"Un servicio por id","service_id":"00000000-0000-0000-0000-00000000fc43"},
      {"description":"Un servicio por nombre","service_name":"  pulido   MÚLTIPLE "}]'::jsonb);
grant select on r to authenticated;

select results_eq(
  $$ select service_ids, service_id, service_name from public.pieces
     where restoration_id = (select id from r) and number = 1 $$,
  $$ values (array['00000000-0000-0000-0000-00000000fc42', '00000000-0000-0000-0000-00000000fc41']::uuid[],
             '00000000-0000-0000-0000-00000000fc42'::uuid,
             'Grabado múltiple, Pulido múltiple') $$,
  'la pieza guarda sus servicios sin repetir y en orden; los nombres salen del catálogo'
);
select results_eq(
  $$ select service_ids, service_name from public.pieces
     where restoration_id = (select id from r) and number = 2 $$,
  $$ values (array['00000000-0000-0000-0000-00000000fc43']::uuid[], 'Baño múltiple') $$,
  'un solo service_id (clientes antiguos) se convierte en la lista'
);
select results_eq(
  $$ select service_ids, service_name from public.pieces
     where restoration_id = (select id from r) and number = 3 $$,
  $$ values (array['00000000-0000-0000-0000-00000000fc41']::uuid[], 'Pulido múltiple') $$,
  'un nombre sin id se enlaza con el ítem activo del catálogo'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000fc20', null, 'contado', null, '',
       '[{"description":"Servicio inexistente","service_ids":["00000000-0000-0000-0000-00000000ffff"]}]'::jsonb) $$,
  '23503', null, 'no se acepta un servicio que no existe'
);

-- 2. Edición.
update public.pieces set service_ids = array['00000000-0000-0000-0000-00000000fc43', '00000000-0000-0000-0000-00000000fc41']::uuid[]
where restoration_id = (select id from r) and number = 1;
select results_eq(
  $$ select service_id, service_name from public.pieces
     where restoration_id = (select id from r) and number = 1 $$,
  $$ values ('00000000-0000-0000-0000-00000000fc43'::uuid, 'Baño múltiple, Pulido múltiple') $$,
  'al cambiar los servicios se actualizan el primero y los nombres'
);

reset role;
update public.services set name = 'Baño renombrado' where id = '00000000-0000-0000-0000-00000000fc43';
set local role authenticated;
update public.pieces set notes = 'Solo cambian las notas'
where restoration_id = (select id from r) and number = 1;
select is(
  (select service_name from public.pieces where restoration_id = (select id from r) and number = 1),
  'Baño múltiple, Pulido múltiple', 'si no cambian los servicios se conserva el nombre guardado'
);

-- 3. Un servicio que es el segundo de una pieza no se borra (service_ids no tiene FK).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fc2","role":"authenticated"}', true);
update public.pieces set service_ids = '{}'
where restoration_id = (select id from r) and number = 3;
select throws_ok(
  $$ delete from public.services where id = '00000000-0000-0000-0000-00000000fc41' $$,
  '23503', null, 'no se borra un servicio que es el segundo de una pieza'
);
update public.pieces set service_ids = array['00000000-0000-0000-0000-00000000fc43']::uuid[]
where restoration_id = (select id from r) and number = 1;
select lives_ok(
  $$ delete from public.services where id = '00000000-0000-0000-0000-00000000fc41' $$,
  'cuando ninguna pieza lo usa, se borra'
);

-- 4. Cotización de WhatsApp.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fc1","role":"authenticated"}', true);
create temporary table q as
  select * from public.create_whatsapp_quote('00000000-0000-0000-0000-00000000fc20', null, '', '', 'contado', null, '',
    '[{"description":"Cotizada","price":"80",
       "service_ids":["00000000-0000-0000-0000-00000000fc43","00000000-0000-0000-0000-00000000fc42"]}]'::jsonb);
grant select on q to authenticated;
select results_eq(
  $$ select service_ids, service_name from public.whatsapp_quote_items where quote_id = (select id from q) $$,
  $$ values (array['00000000-0000-0000-0000-00000000fc43', '00000000-0000-0000-0000-00000000fc42']::uuid[],
             'Baño renombrado, Grabado múltiple') $$,
  'la pieza cotizada también lleva varios servicios'
);

create temporary table c as
  select * from public.create_restoration_from_whatsapp_quote(
    (select id from q), '00000000-0000-0000-0000-00000000fc20', null, 'contado', null, '',
    (select jsonb_agg(jsonb_build_object(
       'description', i.description, 'price', i.price::text,
       'service_ids', to_jsonb(i.service_ids), 'quote_item_id', i.id, 'status', 'aprobada'))
     from public.whatsapp_quote_items i where i.quote_id = (select id from q)));
grant select on c to authenticated;
select is(
  (select service_ids from public.pieces where restoration_id = (select id from c)),
  array['00000000-0000-0000-0000-00000000fc43', '00000000-0000-0000-0000-00000000fc42']::uuid[],
  'al pedir la cotización, la pieza conserva sus servicios'
);

-- 5. La vista operativa expone los servicios (para editar la pieza).
select is(
  (select service_ids from public.pieces_operational where restoration_id = (select id from c)),
  array['00000000-0000-0000-0000-00000000fc43', '00000000-0000-0000-0000-00000000fc42']::uuid[],
  'la vista operativa expone los servicios'
);

select * from finish();
rollback;
