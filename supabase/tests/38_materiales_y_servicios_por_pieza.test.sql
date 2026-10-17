begin;

select plan(13);

-- Materiales y servicios de la pieza desde el catálogo: solo el admin los crea (en
-- Configuración), la pieza lleva varios materiales y los nombres los deriva la BD.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fb1', 'ventas@catalogo.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000fb2', 'admin@catalogo.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-000000000fb3', 'logistica@catalogo.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000fb20', 'persona', 'Catálogo');
insert into public.materials (id, name, active) values
  ('00000000-0000-0000-0000-00000000fb31', 'Cobre de prueba', true),
  ('00000000-0000-0000-0000-00000000fb32', 'Estaño de prueba', true),
  ('00000000-0000-0000-0000-00000000fb33', 'Latón de prueba', false);
insert into public.services (id, name) values
  ('00000000-0000-0000-0000-00000000fb41', 'Pulido de prueba'),
  ('00000000-0000-0000-0000-00000000fb42', 'Grabado de prueba');
insert into public.materials (id, name) values
  ('00000000-0000-0000-0000-00000000fb34', 'Níquel de prueba');

set local role authenticated;

-- 1. Los ítems ya no se crean desde la pieza.
select hasnt_function(
  'public', 'create_catalog_option',
  'el formulario de la pieza ya no crea materiales ni servicios'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fb1","role":"authenticated"}', true);

-- 2. Varios materiales por pieza al registrar la restauración.
create temporary table r as
  select * from public.create_restoration('00000000-0000-0000-0000-00000000fb20', null, 'contado', null, '',
    '[{"description":"Dos materiales","service_id":"00000000-0000-0000-0000-00000000fb41",
       "material_ids":["00000000-0000-0000-0000-00000000fb32","00000000-0000-0000-0000-00000000fb31","00000000-0000-0000-0000-00000000fb32"]},
      {"description":"Texto libre","service_name":"Grabado de prueba","material_name":"Níquel de prueba"}]'::jsonb);
grant select on r to authenticated;

select results_eq(
  $$ select material_ids, material_id, material_name, service_name from public.pieces
     where restoration_id = (select id from r) and number = 1 $$,
  $$ values (array['00000000-0000-0000-0000-00000000fb32', '00000000-0000-0000-0000-00000000fb31']::uuid[],
             '00000000-0000-0000-0000-00000000fb32'::uuid,
             'Estaño de prueba, Cobre de prueba', 'Pulido de prueba') $$,
  'la pieza guarda sus materiales sin repetir y en orden; los nombres salen del catálogo'
);
select results_eq(
  $$ select p.service_id = s.id, p.material_ids = array[m.id]
     from public.pieces p
     join public.services s on s.name = 'Grabado de prueba'
     join public.materials m on m.name = 'Níquel de prueba'
     where p.restoration_id = (select id from r) and p.number = 2 $$,
  $$ values (true, true) $$,
  'un nombre escrito sin id se enlaza con el ítem del catálogo (sin distinguir mayúsculas ni espacios)'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000fb20', null, 'contado', null, '',
       '[{"description":"Servicio inexistente","service_name":"Dorado de prueba"}]'::jsonb) $$,
  '23503', null, 'un nombre que no está en el catálogo no lo crea: se rechaza'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000fb20', null, 'contado', null, '',
       '[{"description":"Material desactivado","material_name":"Latón de prueba"}]'::jsonb) $$,
  '23503', null, 'por nombre solo se enlazan ítems activos'
);
select is(
  (select count(*)::int from public.services where name = 'Dorado de prueba'),
  0, 'y no queda creado en el catálogo'
);
select throws_ok(
  $$ select * from public.create_restoration('00000000-0000-0000-0000-00000000fb20', null, 'contado', null, '',
       '[{"description":"Material inexistente","material_ids":["00000000-0000-0000-0000-00000000ffff"]}]'::jsonb) $$,
  '23503', null, 'no se acepta un material que no existe'
);

-- 3. Edición.
update public.pieces set material_ids = array['00000000-0000-0000-0000-00000000fb31']::uuid[]
where restoration_id = (select id from r) and number = 1;
select results_eq(
  $$ select material_id, material_name from public.pieces
     where restoration_id = (select id from r) and number = 1 $$,
  $$ values ('00000000-0000-0000-0000-00000000fb31'::uuid, 'Cobre de prueba') $$,
  'al cambiar los materiales se actualizan el primero y los nombres'
);

reset role;
update public.materials set name = 'Cobre renombrado' where id = '00000000-0000-0000-0000-00000000fb31';
set local role authenticated;
update public.pieces set notes = 'Solo cambian las notas'
where restoration_id = (select id from r) and number = 1;
select is(
  (select material_name from public.pieces where restoration_id = (select id from r) and number = 1),
  'Cobre de prueba', 'si no cambian los materiales se conserva el nombre guardado'
);

update public.pieces set material_ids = '{}'
where restoration_id = (select id from r) and number = 1;
select results_eq(
  $$ select material_id, material_name from public.pieces
     where restoration_id = (select id from r) and number = 1 $$,
  $$ values (null::uuid, '') $$,
  'la pieza puede quedar sin material'
);

-- 4. Cotización de WhatsApp.
create temporary table q as
  select * from public.create_whatsapp_quote('00000000-0000-0000-0000-00000000fb20', null, '', '', 'contado', null, '',
    '[{"description":"Cotizada","price":"80","service_id":"00000000-0000-0000-0000-00000000fb41",
       "material_ids":["00000000-0000-0000-0000-00000000fb31","00000000-0000-0000-0000-00000000fb32"]}]'::jsonb);
grant select on q to authenticated;
select results_eq(
  $$ select material_ids, material_name from public.whatsapp_quote_items where quote_id = (select id from q) $$,
  $$ values (array['00000000-0000-0000-0000-00000000fb31', '00000000-0000-0000-0000-00000000fb32']::uuid[],
             'Cobre renombrado, Estaño de prueba') $$,
  'la pieza cotizada también lleva varios materiales'
);

create temporary table c as
  select * from public.create_restoration_from_whatsapp_quote(
    (select id from q), '00000000-0000-0000-0000-00000000fb20', null, 'contado', null, '',
    (select jsonb_agg(jsonb_build_object(
       'description', i.description, 'price', i.price::text, 'service_id', i.service_id,
       'material_ids', to_jsonb(i.material_ids), 'quote_item_id', i.id, 'status', 'aprobada'))
     from public.whatsapp_quote_items i where i.quote_id = (select id from q)));
grant select on c to authenticated;
select is(
  (select material_ids from public.pieces where restoration_id = (select id from c)),
  array['00000000-0000-0000-0000-00000000fb31', '00000000-0000-0000-0000-00000000fb32']::uuid[],
  'al pedir la cotización, la pieza conserva sus materiales'
);

-- 5. La vista operativa expone los materiales (para editar la pieza).
select is(
  (select material_ids from public.pieces_operational where restoration_id = (select id from c)),
  array['00000000-0000-0000-0000-00000000fb31', '00000000-0000-0000-0000-00000000fb32']::uuid[],
  'la vista operativa expone los materiales'
);

select * from finish();
rollback;
