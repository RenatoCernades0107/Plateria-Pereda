begin;

select plan(17);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000cc1', 'ventas@archivos.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000cc2', 'logistica@archivos.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-000000000cc3', 'admin@archivos.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-000000000cc4', 'ventas2@archivos.test', '{"role":"ventas"}', '{"full_name":"Otro Vendedor"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000cc20', 'persona', 'Ana');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000cc30', '00000000-0000-0000-0000-00000000cc20', 'contado'),
  ('00000000-0000-0000-0000-00000000cc31', '00000000-0000-0000-0000-00000000cc20', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000cc40', '00000000-0000-0000-0000-00000000cc30', 'Fuente', 10),
  ('00000000-0000-0000-0000-00000000cc41', '00000000-0000-0000-0000-00000000cc31', 'Jarra', 10);
-- La segunda restauración es pasada (completada): logística ya no la ve (D24).
update public.restorations set status = 'completada' where id = '00000000-0000-0000-0000-00000000cc31';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000cc1","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
       ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000cc30/general/a.jpg',
        '00000000-0000-0000-0000-000000000cc1'),
       ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000cc30/pieces/00000000-0000-0000-0000-00000000cc40/b.pdf',
        '00000000-0000-0000-0000-000000000cc1') $$,
  'ventas sube archivos al bucket de una restauración'
);
select lives_ok(
  $$ insert into public.restoration_files (restoration_id, piece_id, path, name, mime_type, size_bytes, category) values
       ('00000000-0000-0000-0000-00000000cc30', null,
        'restorations/00000000-0000-0000-0000-00000000cc30/general/a.jpg', 'general.jpg', 'image/jpeg', 1000, 'antes'),
       ('00000000-0000-0000-0000-00000000cc30', '00000000-0000-0000-0000-00000000cc40',
        'restorations/00000000-0000-0000-0000-00000000cc30/pieces/00000000-0000-0000-0000-00000000cc40/b.pdf', 'guia.pdf',
        'application/pdf', 2000, 'documento') $$,
  'y los registra (foto general y documento de una pieza)'
);
select results_eq(
  $$ select created_by::text, created_by_name from public.restoration_files where name = 'general.jpg' $$,
  $$ values ('00000000-0000-0000-0000-000000000cc1', 'Vera Ventas') $$,
  'se guarda quién lo subió'
);
select throws_ok(
  $$ insert into public.restoration_files (restoration_id, path, name, mime_type, size_bytes, category) values
       ('00000000-0000-0000-0000-00000000cc30', 'restorations/otra/general/x.jpg', 'x.jpg', 'image/jpeg', 10, 'otro') $$,
  '23514', null, 'la ruta debe ser de la restauración'
);
select throws_ok(
  $$ insert into public.restoration_files (restoration_id, piece_id, path, name, mime_type, size_bytes, category) values
       ('00000000-0000-0000-0000-00000000cc30', '00000000-0000-0000-0000-00000000cc41',
        'restorations/00000000-0000-0000-0000-00000000cc30/pieces/00000000-0000-0000-0000-00000000cc41/x.jpg',
        'x.jpg', 'image/jpeg', 10, 'otro') $$,
  '23514', 'La pieza no es de esta restauración', 'la pieza debe ser de la restauración'
);
select throws_ok(
  $$ insert into public.restoration_files (restoration_id, path, name, mime_type, size_bytes, category) values
       ('00000000-0000-0000-0000-00000000cc30', 'restorations/00000000-0000-0000-0000-00000000cc30/general/x.exe',
        'x.exe', 'application/x-msdownload', 10, 'otro') $$,
  '23514', null, 'solo tipos permitidos'
);
select throws_ok(
  $$ insert into public.restoration_files (restoration_id, path, name, mime_type, size_bytes, category) values
       ('00000000-0000-0000-0000-00000000cc30', 'restorations/00000000-0000-0000-0000-00000000cc30/general/x.jpg',
        'x.jpg', 'image/jpeg', 10485761, 'otro') $$,
  '23514', null, 'máximo 10 MB (P32)'
);

-- Logística: ve y sube en restauraciones activas; no en las pasadas.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000cc2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.restoration_files
   where restoration_id in ('00000000-0000-0000-0000-00000000cc30', '00000000-0000-0000-0000-00000000cc31')), 2,
  'logística ve los archivos de la restauración activa'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'restoration-files' and name like 'restorations/00000000-0000-0000-0000-00000000cc3%'), 2,
  'y puede leer sus objetos (URLs firmadas)'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
       ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000cc30/general/c.jpg',
        '00000000-0000-0000-0000-000000000cc2') $$,
  'logística sube la foto general (P42)'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
       ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000cc31/general/d.jpg',
        '00000000-0000-0000-0000-000000000cc2') $$,
  '42501', null, 'logística no sube a una restauración pasada'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
       ('restoration-files', 'otra-carpeta/e.jpg', '00000000-0000-0000-0000-000000000cc2') $$,
  '42501', null, 'solo se sube dentro de una restauración'
);
-- La API de Storage borra con esta marca; la prueba evalúa solo las políticas.
select set_config('storage.allow_delete_query', 'true', true);
-- El objeto que subió y no registró, lo puede borrar quien lo subió.
with d as (delete from storage.objects
     where bucket_id = 'restoration-files' and name like '%/general/c.jpg' returning 1)
select is((select count(*)::int from d), 1, 'quien subió un objeto sin registrar lo puede borrar');

-- Borrar: solo el admin y quien lo subió.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000cc4","role":"authenticated"}', true);
with d as (delete from public.restoration_files where name = 'general.jpg' returning 1)
select is((select count(*)::int from d), 0, 'otro vendedor no borra un archivo ajeno');
with d as (delete from storage.objects where bucket_id = 'restoration-files' and name like '%/general/a.jpg' returning 1)
select is((select count(*)::int from d), 0, 'ni su objeto');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000cc3","role":"authenticated"}', true);
with d as (delete from public.restoration_files where name = 'general.jpg' returning 1)
select is((select count(*)::int from d), 1, 'el admin borra cualquier archivo');

set local role anon;
select throws_ok(
  $$ select count(*) from public.restoration_files $$,
  '42501', null, 'sin sesión no se leen archivos'
);

select * from finish();
rollback;
