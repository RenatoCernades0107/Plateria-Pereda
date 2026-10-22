-- Fotos de las cotizaciones de WhatsApp y su plantilla propia (2026-10-21).
begin;

select plan(17);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fa1', 'ventas@cwafotos.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000fa2', 'logistica@cwafotos.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-000000000fa3', 'ventas2@cwafotos.test', '{"role":"ventas"}', '{"full_name":"Otro Vendedor"}');

select has_column('public', 'settings', 'whatsapp_quote_template', 'la configuración tiene la plantilla de las cotizaciones de WhatsApp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa1","role":"authenticated"}', true);

create temporary table q as
  select * from public.create_whatsapp_quote(null, null, 'Ana', '', 'contado', null, '',
    '[{"description":"Fuente","price":"100"},
      {"description":"Jarra","price":"60"}]'::jsonb);
create temporary table items as
  select i.id, i.number from public.whatsapp_quote_items i where i.quote_id = (select id from q);

-- Ventas sube una foto general y una de la pieza 1.
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id) values
       ('restoration-files', 'whatsapp-quotes/%1$s/general/a.jpg', '00000000-0000-0000-0000-000000000fa1'),
       ('restoration-files', 'whatsapp-quotes/%1$s/items/%2$s/b.jpg', '00000000-0000-0000-0000-000000000fa1') $$,
    (select id from q), (select id from items where number = 1)),
  'ventas sube fotos de la cotización al bucket'
);
select lives_ok(
  format($$ insert into public.whatsapp_quote_files (quote_id, item_id, path, name, mime_type, size_bytes, category) values
       ('%1$s', null, 'whatsapp-quotes/%1$s/general/a.jpg', 'general.jpg', 'image/jpeg', 1000, 'antes'),
       ('%1$s', '%2$s', 'whatsapp-quotes/%1$s/items/%2$s/b.jpg', 'fuente.jpg', 'image/jpeg', 1000, 'antes') $$,
    (select id from q), (select id from items where number = 1)),
  'y las registra (general y de una pieza)'
);
select results_eq(
  $$ select created_by_name from public.whatsapp_quote_files where name = 'general.jpg' $$,
  $$ values ('Vera Ventas') $$,
  'se guarda quién la subió'
);
select throws_ok(
  format($$ insert into public.whatsapp_quote_files (quote_id, path, name, mime_type, size_bytes, category) values
       ('%s', 'whatsapp-quotes/otra/general/x.jpg', 'x.jpg', 'image/jpeg', 10, 'otro') $$, (select id from q)),
  '23514', null, 'la ruta debe ser de la cotización'
);

-- Logística no ve las cotizaciones de WhatsApp ni sus fotos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.whatsapp_quote_files), 0,
  'logística no ve los archivos de las cotizaciones'
);
select is(
  (select count(*)::int from storage.objects where name like 'whatsapp-quotes/%'), 0,
  'ni sus objetos en el bucket'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id) values
       ('restoration-files', 'whatsapp-quotes/%s/general/c.jpg', '00000000-0000-0000-0000-000000000fa2') $$,
    (select id from q)),
  '42501', null, 'ni sube al bucket'
);

-- Otro vendedor no borra lo que subió otro.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa3","role":"authenticated"}', true);
delete from public.whatsapp_quote_files where name = 'general.jpg';
select is(
  (select count(*)::int from public.whatsapp_quote_files where quote_id = (select id from q)), 2,
  'solo el admin o quien subió el archivo lo borra'
);

-- Al editar, las piezas que siguen conservan su id y sus fotos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000fa1","role":"authenticated"}', true);
select lives_ok(
  format($$ select public.update_whatsapp_quote('%s', null, null, 'Ana', '', 'contado', null, '',
       '[{"description":"Fuente editada","price":"120","quote_item_id":"%s"},
         {"description":"Nueva","price":"10"}]'::jsonb) $$,
    (select id from q), (select id from items where number = 1)),
  'se edita la cotización quitando la Jarra y agregando una pieza'
);
set constraints all immediate;
select results_eq(
  format($$ select number, description, id = '%s' from public.whatsapp_quote_items
     where quote_id = '%s' order by number $$,
    (select id from items where number = 1), (select id from q)),
  $$ values (1, 'Fuente editada', true), (2, 'Nueva', false) $$,
  'la pieza editada conserva su id'
);
select results_eq(
  format($$ select item_id is not distinct from '%s'::uuid from public.whatsapp_quote_files where name = 'fuente.jpg' $$,
    (select id from items where number = 1)),
  $$ values (true) $$,
  'y su foto sigue con ella'
);
select throws_ok(
  format($$ select public.update_whatsapp_quote('%s', null, null, 'Ana', '', 'contado', null, '',
       '[{"description":"Ajena","price":"1","quote_item_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb) $$,
    (select id from q)),
  '23514', 'La pieza no es de esta cotización.', 'no se puede usar una pieza de otra cotización'
);

-- Si se quita la pieza, su foto pasa a ser general.
select lives_ok(
  format($$ select public.update_whatsapp_quote('%s', null, null, 'Ana', '', 'contado', null, '',
       '[{"description":"Solo nueva","price":"10"}]'::jsonb) $$,
    (select id from q)),
  'se quita la pieza que tenía foto'
);
set constraints all immediate;
select results_eq(
  $$ select item_id from public.whatsapp_quote_files where name = 'fuente.jpg' $$,
  $$ values (null::uuid) $$,
  'y su foto queda como foto general de la cotización'
);

-- El listado se ordena por total, de mayor a menor o al revés.
create temporary table q2 as
  select * from public.create_whatsapp_quote(null, null, 'Beto', '', 'contado', null, '',
    '[{"description":"Bandeja","price":"500"}]'::jsonb);
select results_eq(
  format($$ select code from public.list_whatsapp_quotes(p_sort => 'total', p_dir => 'desc')
     where id in ('%s', '%s') $$, (select id from q), (select id from q2)),
  format($$ values ('%s'), ('%s') $$, (select code from q2), (select code from q)),
  'ordena por total, de mayor a menor'
);
select results_eq(
  format($$ select code from public.list_whatsapp_quotes(p_sort => 'client', p_dir => 'asc')
     where id in ('%s', '%s') $$, (select id from q), (select id from q2)),
  format($$ values ('%s'), ('%s') $$, (select code from q), (select code from q2)),
  'y por cliente (o nombre anotado), de la A a la Z'
);

select * from finish();
rollback;
