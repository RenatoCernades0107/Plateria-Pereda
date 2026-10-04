begin;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin@config.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'ventas@config.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'logistica@config.test', '{"role":"logistica"}', '{}');

select is((select count(*)::int from public.settings), 1, 'existe una sola fila de configuración');
select results_eq(
  $$ select quote_validity_days, deposit_percent from public.settings $$,
  $$ values (15, 50.00::numeric(5, 2)) $$,
  'vigencia de 15 días y adelanto de 50 % por defecto'
);
select throws_ok(
  $$ insert into public.settings (id) values (false) $$,
  '23514', null, 'no se puede crear otra fila'
);
select throws_ok(
  $$ update public.settings set deposit_percent = 0 $$,
  '23514', null, 'el adelanto debe estar entre 1 y 100 %'
);
select throws_ok(
  $$ update public.settings set quote_validity_days = 0 $$,
  '23514', null, 'la vigencia debe ser de al menos un día'
);
select throws_ok(
  $$ update public.settings set ruc = '123' $$,
  '23514', null, 'el RUC tiene 11 dígitos'
);

-- Logística lee pero no edita
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select is((select count(*)::int from public.settings), 1, 'logística lee la configuración');
update public.settings set legal_name = 'Cambiado por logística';

-- Ventas tampoco edita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
update public.settings set legal_name = 'Cambiado por ventas';
reset role;
select is((select legal_name from public.settings), 'Platería Pereda', 'ventas y logística no editan la configuración');

-- Admin edita y queda auditado
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
update public.settings set quote_validity_days = 30;
select throws_ok(
  $$ delete from public.settings $$,
  '42501', null, 'ni el admin puede borrar la configuración'
);
reset role;
select is((select quote_validity_days from public.settings), 30, 'admin edita la configuración');
select results_eq(
  $$ select actor_name, changes from public.audit_log
     where table_name = 'settings' and actor_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('Ana Admin', '{"quote_validity_days": {"old": 15, "new": 30}}'::jsonb) $$,
  'el cambio de configuración queda auditado'
);

-- Anónimo
set local role anon;
select throws_ok(
  $$ select * from public.settings $$,
  '42501', null, 'un anónimo no lee la configuración'
);

-- Logo en el bucket "branding"
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('branding', 'logo/ventas.png') $$,
  '42501', null, 'ventas no sube el logo'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('branding', 'logo/admin.png') $$,
  'admin sube el logo'
);
reset role;
select ok(
  (select public from storage.buckets where id = 'branding'),
  'el logo se lee sin iniciar sesión (bucket público)'
);

select * from finish();
rollback;
