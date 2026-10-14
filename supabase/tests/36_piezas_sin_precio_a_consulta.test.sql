begin;

select plan(6);

-- Sin precio de venta la pieza pasa a Consulta al registrar la restauración, directa o
-- desde una cotización de WhatsApp (que ahora acepta piezas sin precio).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fa1', 'ventas@sinprecio.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000fa2', 'admin@sinprecio.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000fa20', 'persona', 'Sin Precio');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa2","role":"authenticated"}', true);

create temporary table r as
  select * from public.create_restoration('00000000-0000-0000-0000-00000000fa20', null, 'contado', null, '',
    '[{"description":"Con precio","price":"50"},{"description":"Sin precio","price":""}]'::jsonb);
grant select on r to authenticated;

select results_eq(
  $$ select description, status::text from public.pieces
     where restoration_id = (select id from r) order by number $$,
  $$ values ('Con precio', 'registrada'), ('Sin precio', 'en_consulta') $$,
  'al registrar, la pieza sin precio pasa a Consulta y la otra queda Registrada'
);
select is(
  (select h.note from public.piece_status_history h
   join public.pieces p on p.id = h.piece_id
   where p.restoration_id = (select id from r) and h.to_status = 'en_consulta'),
  'Sin precio de venta: consultar el precio.',
  'la Consulta lleva una nota que explica el motivo'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa1","role":"authenticated"}', true);
create temporary table q as
  select * from public.create_whatsapp_quote('00000000-0000-0000-0000-00000000fa20', null, '', '', 'contado', null, '',
    '[{"description":"Cotizada","price":"80"},{"description":"Por definir"}]'::jsonb);
grant select on q to authenticated;

select results_eq(
  $$ select i.description, i.price from public.whatsapp_quote_items i
     where i.quote_id = (select id from q) order by i.number $$,
  $$ values ('Cotizada', 80.00::numeric), ('Por definir', null::numeric) $$,
  'la cotización de WhatsApp acepta piezas sin precio'
);
select is(
  (select total from public.whatsapp_quotes where id = (select id from q)),
  80.00::numeric, 'la pieza sin precio no suma al total de la cotización'
);

create temporary table c as
  select * from public.create_restoration_from_whatsapp_quote(
    (select id from q), '00000000-0000-0000-0000-00000000fa20', null, 'contado', null, '',
    (select jsonb_agg(jsonb_build_object(
       'description', i.description, 'price', coalesce(i.price::text, ''),
       'quote_item_id', i.id, 'status', 'aprobada') order by i.number)
     from public.whatsapp_quote_items i where i.quote_id = (select id from q)));
grant select on c to authenticated;

select results_eq(
  $$ select description, status::text from public.pieces
     where restoration_id = (select id from c) order by number $$,
  $$ values ('Cotizada', 'aprobada'), ('Por definir', 'en_consulta') $$,
  'desde la cotización, la pieza sin precio va a Consulta aunque se eligiera Aprobada'
);
select is(
  (select price from public.pieces where restoration_id = (select id from c) and description = 'Cotizada'),
  80.00::numeric, 'el precio cotizado se conserva aunque copie ventas'
);

select * from finish();
rollback;
