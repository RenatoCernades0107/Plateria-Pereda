begin;
set local client_min_messages = warning;

-- Paso 15.1: matriz completa de permisos, cada tabla × operación × rol.
--
-- Para cada celda se combinan los privilegios de la tabla (o de alguna columna, en
-- INSERT y UPDATE) con las políticas de RLS que aplican al rol, evaluadas como ese rol
-- sobre las filas que hay en la tabla (las del seed y las de este test):
--   si    = todas las filas        filas = solo algunas (p. ej., las propias)
--   no    = ninguna o sin privilegio
-- En INSERT se evalúa el WITH CHECK sobre las filas existentes ("podría insertar una fila
-- así"); en UPDATE y DELETE, el USING. Las vistas se comparan con lo que ve el admin.
-- Las reglas que imponen los triggers (p. ej., quién asigna el taller) tienen sus
-- propios tests; aquí solo se mira el acceso a las filas.
--
-- Una tabla nueva hace fallar el test hasta que se agregue a la matriz.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000e601', 'admin@matriz.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-00000000e602', 'ventas@matriz.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-00000000e603', 'logistica@matriz.test', '{"role":"logistica"}', '{}');

-- Al menos una fila en cada tabla, y en las políticas que dependen de la fila, filas
-- que pasan y filas que no (para que el resultado no dependa del seed).
insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000e620', 'persona', 'Matriz', 'gid://shopify/Customer/e620');
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-00000000e630', '00000000-0000-0000-0000-00000000e620', 'contado'),
  ('00000000-0000-0000-0000-00000000e631', '00000000-0000-0000-0000-00000000e620', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000e640', '00000000-0000-0000-0000-00000000e630', 'Fuente', 100),
  ('00000000-0000-0000-0000-00000000e641', '00000000-0000-0000-0000-00000000e631', 'Bandeja', 50);
-- Una restauración pasada (anulada): logística ya no la ve.
update public.pieces set status = 'anulada' where id = '00000000-0000-0000-0000-00000000e641';

-- Pagos: uno que ventas puede registrar, uno sin Shopify (solo admin) y uno de Shopify.
insert into public.payments (restoration_id, amount, method_name, source, kind, skip_shopify, shopify_transaction_id) values
  ('00000000-0000-0000-0000-00000000e630', 10, 'Efectivo', 'sistema', 'pago', false, null),
  ('00000000-0000-0000-0000-00000000e630', 5, 'Efectivo', 'sistema', 'pago', true, null),
  ('00000000-0000-0000-0000-00000000e630', 20, 'Tarjeta', 'shopify', 'pago', false, 'gid://shopify/OrderTransaction/e651');
insert into public.shopify_order_transactions (id, restoration_id, origin)
  values ('gid://shopify/OrderTransaction/e650', '00000000-0000-0000-0000-00000000e630', 'shopify');
insert into public.shopify_sync_jobs (kind, entity_table, entity_id)
  values ('customer.create', 'clients', '00000000-0000-0000-0000-00000000e620');
insert into public.shopify_webhook_events (webhook_id, topic, shop_domain, payload)
  values ('matriz-e660', 'orders/paid', 'matriz.myshopify.com', '{}');
insert into public.shopify_tokens (shop_domain, access_token, expires_at)
  values ('matriz.myshopify.com', 'token', now() + interval '1 day');

insert into public.quotes (id, client_id) values
  ('00000000-0000-0000-0000-00000000e670', '00000000-0000-0000-0000-00000000e620');
insert into public.quote_items (quote_id, title, quantity, unit_price)
  values ('00000000-0000-0000-0000-00000000e670', 'Anillo', 1, 10);
insert into public.whatsapp_quotes (id, payment_type)
  values ('00000000-0000-0000-0000-00000000e680', 'contado');
insert into public.whatsapp_quote_items (quote_id, number, description)
  values ('00000000-0000-0000-0000-00000000e680', 1, 'Jarra');
-- Archivos subidos por el admin, ventas y logística (el trigger toma el autor de la sesión).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e601","role":"authenticated"}', true);
insert into public.whatsapp_quote_files (quote_id, path, name, mime_type, size_bytes, category) values
  ('00000000-0000-0000-0000-00000000e680', 'whatsapp-quotes/00000000-0000-0000-0000-00000000e680/a.jpg', 'a.jpg',
   'image/jpeg', 10, 'antes');
insert into public.restoration_files (restoration_id, path, name, mime_type, size_bytes, category) values
  ('00000000-0000-0000-0000-00000000e631', 'restorations/00000000-0000-0000-0000-00000000e631/general/b.jpg', 'b.jpg',
   'image/jpeg', 10, 'antes');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e602","role":"authenticated"}', true);
insert into public.whatsapp_quote_files (quote_id, path, name, mime_type, size_bytes, category) values
  ('00000000-0000-0000-0000-00000000e680', 'whatsapp-quotes/00000000-0000-0000-0000-00000000e680/b.jpg', 'b.jpg',
   'image/jpeg', 10, 'antes');
insert into public.restoration_files (restoration_id, path, name, mime_type, size_bytes, category) values
  ('00000000-0000-0000-0000-00000000e630', 'restorations/00000000-0000-0000-0000-00000000e630/general/a.jpg', 'a.jpg',
   'image/jpeg', 10, 'antes');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e603","role":"authenticated"}', true);
insert into public.restoration_files (restoration_id, path, name, mime_type, size_bytes, category) values
  ('00000000-0000-0000-0000-00000000e630', 'restorations/00000000-0000-0000-0000-00000000e630/general/c.jpg', 'c.jpg',
   'image/jpeg', 10, 'antes');
select set_config('request.jwt.claims', '', true);

insert into public.notifications (recipient_id, kind, restoration_id, txid) values
  ('00000000-0000-0000-0000-00000000e601', 'guia_lista', '00000000-0000-0000-0000-00000000e630', 1),
  ('00000000-0000-0000-0000-00000000e602', 'guia_lista', '00000000-0000-0000-0000-00000000e630', 1),
  ('00000000-0000-0000-0000-00000000e603', 'aprobacion_total', '00000000-0000-0000-0000-00000000e630', 1);

insert into storage.objects (bucket_id, name) values
  ('branding', 'logo/matriz.png'),
  ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000e630/general/a.jpg'),
  ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000e630/general/c.jpg'),
  ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000e631/general/b.jpg'),
  ('restoration-files', 'restorations/00000000-0000-0000-0000-00000000e630/general/sin-registro.jpg');

-- Acceso de un rol a una tabla para una operación: 'si', 'filas' o 'no'.
create function pg_temp.acceso(p_table regclass, p_cmd text, p_role text) returns text
language plpgsql as $fn$
declare
  v_db_role text := case p_role when 'anon' then 'anon' else 'authenticated' end;
  v_rel pg_class;
  v_cmd "char" := case p_cmd when 'select' then 'r' when 'insert' then 'a' when 'update' then 'w' else 'd' end;
  v_permisivas text;
  v_restrictivas text;
  v_total bigint;
  v_pasan bigint;
begin
  select * into v_rel from pg_class where oid = p_table;
  if not (case when p_cmd in ('insert', 'update')
               then has_any_column_privilege(v_db_role, p_table, p_cmd)
               else has_table_privilege(v_db_role, p_table, p_cmd) end) then
    return 'no';
  end if;

  if v_rel.relkind = 'v' then
    perform pg_temp.como('admin');
    execute format('select count(*) from %s', p_table) into v_total;
    perform pg_temp.como(p_role);
    execute format('select count(*) from %s', p_table) into v_pasan;
    perform set_config('role', 'postgres', true);
  else
    if not v_rel.relrowsecurity then return 'si'; end if;

    select string_agg('(' || pg_get_expr(q, polrelid) || ')', ' or ') filter (where polpermissive),
           string_agg('(' || pg_get_expr(q, polrelid) || ')', ' and ') filter (where not polpermissive)
      into v_permisivas, v_restrictivas
    from (select p.*, case when p_cmd = 'insert' then p.polwithcheck else p.polqual end as q
          from pg_policy p
          where p.polrelid = p_table
            and p.polcmd in (v_cmd, '*')
            and (p.polroles @> array[0::oid] or p.polroles @> array[v_db_role::regrole::oid])) p;
    if v_permisivas is null then return 'no'; end if;

    -- Las filas se copian sin RLS y las políticas se evalúan como el rol sobre la copia
    -- (con el nombre de la tabla, porque las expresiones lo usan para sus columnas).
    drop table if exists pg_temp.filas;
    execute format('create temp table filas as select * from %s', p_table);
    grant select on pg_temp.filas to anon, authenticated;
    perform pg_temp.como(p_role);
    execute format('select count(*), count(*) filter (where (%s) and (%s)) from pg_temp.filas as %I',
      v_permisivas, coalesce(v_restrictivas, 'true'), v_rel.relname)
      into v_total, v_pasan;
    perform set_config('role', 'postgres', true);
  end if;

  if v_total = 0 then
    raise exception 'La tabla % no tiene filas para evaluar la matriz: agrega una al test.', p_table;
  end if;
  return case when v_pasan = 0 then 'no' when v_pasan = v_total then 'si' else 'filas' end;
end
$fn$;

create function pg_temp.como(p_role text) returns void
language sql as $$
  select set_config('request.jwt.claims', case p_role
    when 'anon' then '{"role":"anon"}'
    else json_build_object('role', 'authenticated', 'sub', case p_role
      when 'admin' then '00000000-0000-0000-0000-00000000e601'
      when 'ventas' then '00000000-0000-0000-0000-00000000e602'
      else '00000000-0000-0000-0000-00000000e603' end)::text end, true),
    set_config('role', case p_role when 'anon' then 'anon' else 'authenticated' end, true);
$$;

create temp table matriz (tabla text, operacion text, anon text, admin text, ventas text, logistica text);
insert into matriz values
  -- tabla                          operación  anon  admin    ventas   logística
  ('alert_settings',               'select',  'no', 'si',    'si',    'si'),
  ('alert_settings',               'insert',  'no', 'no',    'no',    'no'),
  ('alert_settings',               'update',  'no', 'si',    'no',    'no'),
  ('alert_settings',               'delete',  'no', 'no',    'no',    'no'),
  ('audit_log',                    'select',  'no', 'si',    'filas', 'no'),
  ('audit_log',                    'insert',  'no', 'no',    'no',    'no'),
  ('audit_log',                    'update',  'no', 'no',    'no',    'no'),
  ('audit_log',                    'delete',  'no', 'no',    'no',    'no'),
  ('branches',                     'select',  'no', 'si',    'si',    'no'),
  ('branches',                     'insert',  'no', 'si',    'no',    'no'),
  ('branches',                     'update',  'no', 'si',    'no',    'no'),
  ('branches',                     'delete',  'no', 'si',    'no',    'no'),
  ('clients',                      'select',  'no', 'si',    'si',    'si'),
  ('clients',                      'insert',  'no', 'si',    'si',    'no'),
  ('clients',                      'update',  'no', 'si',    'si',    'no'),
  ('clients',                      'delete',  'no', 'no',    'no',    'no'),
  ('contacts',                     'select',  'no', 'si',    'si',    'si'),
  ('contacts',                     'insert',  'no', 'si',    'si',    'no'),
  ('contacts',                     'update',  'no', 'si',    'si',    'no'),
  ('contacts',                     'delete',  'no', 'no',    'no',    'no'),
  ('materials',                    'select',  'no', 'si',    'si',    'si'),
  ('materials',                    'insert',  'no', 'si',    'no',    'no'),
  ('materials',                    'update',  'no', 'si',    'no',    'no'),
  ('materials',                    'delete',  'no', 'si',    'no',    'no'),
  ('notifications',                'select',  'no', 'filas', 'filas', 'filas'),
  ('notifications',                'insert',  'no', 'no',    'no',    'no'),
  ('notifications',                'update',  'no', 'filas', 'filas', 'filas'),
  ('notifications',                'delete',  'no', 'no',    'no',    'no'),
  ('payment_methods',              'select',  'no', 'si',    'si',    'no'),
  ('payment_methods',              'insert',  'no', 'si',    'no',    'no'),
  ('payment_methods',              'update',  'no', 'si',    'no',    'no'),
  ('payment_methods',              'delete',  'no', 'si',    'no',    'no'),
  ('payments',                     'select',  'no', 'si',    'si',    'no'),
  ('payments',                     'insert',  'no', 'filas', 'filas', 'no'),
  ('payments',                     'update',  'no', 'no',    'no',    'no'),
  ('payments',                     'delete',  'no', 'no',    'no',    'no'),
  ('piece_metrics',                'select',  'no', 'si',    'si',    'no'),
  ('piece_metrics',                'insert',  'no', 'no',    'no',    'no'),
  ('piece_metrics',                'update',  'no', 'no',    'no',    'no'),
  ('piece_metrics',                'delete',  'no', 'no',    'no',    'no'),
  ('piece_status_history',         'select',  'no', 'si',    'si',    'no'),
  ('piece_status_history',         'insert',  'no', 'no',    'no',    'no'),
  ('piece_status_history',         'update',  'no', 'no',    'no',    'no'),
  ('piece_status_history',         'delete',  'no', 'no',    'no',    'no'),
  ('piece_status_transitions',     'select',  'no', 'si',    'si',    'si'),
  ('piece_status_transitions',     'insert',  'no', 'no',    'no',    'no'),
  ('piece_status_transitions',     'update',  'no', 'no',    'no',    'no'),
  ('piece_status_transitions',     'delete',  'no', 'no',    'no',    'no'),
  ('pieces',                       'select',  'no', 'si',    'si',    'no'),
  ('pieces',                       'insert',  'no', 'si',    'si',    'no'),
  ('pieces',                       'update',  'no', 'si',    'si',    'no'),
  ('pieces',                       'delete',  'no', 'no',    'no',    'no'),
  ('pieces_operational',           'select',  'no', 'si',    'si',    'filas'),
  ('pieces_operational',           'insert',  'no', 'no',    'no',    'no'),
  ('pieces_operational',           'update',  'no', 'no',    'no',    'no'),
  ('pieces_operational',           'delete',  'no', 'no',    'no',    'no'),
  ('profiles',                     'select',  'no', 'si',    'filas', 'filas'),
  ('profiles',                     'insert',  'no', 'no',    'no',    'no'),
  ('profiles',                     'update',  'no', 'si',    'no',    'no'),
  ('profiles',                     'delete',  'no', 'filas', 'no',    'no'),
  ('quote_items',                  'select',  'no', 'si',    'si',    'no'),
  ('quote_items',                  'insert',  'no', 'si',    'si',    'no'),
  ('quote_items',                  'update',  'no', 'si',    'si',    'no'),
  ('quote_items',                  'delete',  'no', 'si',    'si',    'no'),
  ('quotes',                       'select',  'no', 'si',    'si',    'no'),
  ('quotes',                       'insert',  'no', 'si',    'si',    'no'),
  ('quotes',                       'update',  'no', 'si',    'si',    'no'),
  ('quotes',                       'delete',  'no', 'no',    'no',    'no'),
  ('restoration_files',            'select',  'no', 'si',    'si',    'filas'),
  ('restoration_files',            'insert',  'no', 'si',    'si',    'filas'),
  ('restoration_files',            'update',  'no', 'no',    'no',    'no'),
  ('restoration_files',            'delete',  'no', 'si',    'filas', 'filas'),
  ('restorations',                 'select',  'no', 'si',    'si',    'no'),
  ('restorations',                 'insert',  'no', 'si',    'si',    'no'),
  ('restorations',                 'update',  'no', 'si',    'si',    'no'),
  ('restorations',                 'delete',  'no', 'no',    'no',    'no'),
  ('restorations_operational',     'select',  'no', 'si',    'si',    'filas'),
  ('restorations_operational',     'insert',  'no', 'no',    'no',    'no'),
  ('restorations_operational',     'update',  'no', 'no',    'no',    'no'),
  ('restorations_operational',     'delete',  'no', 'no',    'no',    'no'),
  ('services',                     'select',  'no', 'si',    'si',    'si'),
  ('services',                     'insert',  'no', 'si',    'no',    'no'),
  ('services',                     'update',  'no', 'si',    'no',    'no'),
  ('services',                     'delete',  'no', 'si',    'no',    'no'),
  ('settings',                     'select',  'no', 'si',    'si',    'si'),
  ('settings',                     'insert',  'no', 'no',    'no',    'no'),
  ('settings',                     'update',  'no', 'si',    'no',    'no'),
  ('settings',                     'delete',  'no', 'no',    'no',    'no'),
  ('shopify_order_transactions',   'select',  'no', 'no',    'no',    'no'),
  ('shopify_order_transactions',   'insert',  'no', 'no',    'no',    'no'),
  ('shopify_order_transactions',   'update',  'no', 'no',    'no',    'no'),
  ('shopify_order_transactions',   'delete',  'no', 'no',    'no',    'no'),
  ('shopify_sync_jobs',            'select',  'no', 'si',    'no',    'no'),
  ('shopify_sync_jobs',            'insert',  'no', 'no',    'no',    'no'),
  ('shopify_sync_jobs',            'update',  'no', 'no',    'no',    'no'),
  ('shopify_sync_jobs',            'delete',  'no', 'no',    'no',    'no'),
  ('shopify_tokens',               'select',  'no', 'no',    'no',    'no'),
  ('shopify_tokens',               'insert',  'no', 'no',    'no',    'no'),
  ('shopify_tokens',               'update',  'no', 'no',    'no',    'no'),
  ('shopify_tokens',               'delete',  'no', 'no',    'no',    'no'),
  ('shopify_webhook_events',       'select',  'no', 'si',    'no',    'no'),
  ('shopify_webhook_events',       'insert',  'no', 'no',    'no',    'no'),
  ('shopify_webhook_events',       'update',  'no', 'no',    'no',    'no'),
  ('shopify_webhook_events',       'delete',  'no', 'no',    'no',    'no'),
  ('whatsapp_quote_files',         'select',  'no', 'si',    'si',    'no'),
  ('whatsapp_quote_files',         'insert',  'no', 'si',    'si',    'no'),
  ('whatsapp_quote_files',         'update',  'no', 'no',    'no',    'no'),
  ('whatsapp_quote_files',         'delete',  'no', 'si',    'filas', 'no'),
  ('whatsapp_quote_items',         'select',  'no', 'si',    'si',    'no'),
  ('whatsapp_quote_items',         'insert',  'no', 'no',    'no',    'no'),
  ('whatsapp_quote_items',         'update',  'no', 'no',    'no',    'no'),
  ('whatsapp_quote_items',         'delete',  'no', 'no',    'no',    'no'),
  ('whatsapp_quotes',              'select',  'no', 'si',    'si',    'no'),
  ('whatsapp_quotes',              'insert',  'no', 'no',    'no',    'no'),
  ('whatsapp_quotes',              'update',  'no', 'no',    'no',    'no'),
  ('whatsapp_quotes',              'delete',  'no', 'no',    'no',    'no'),
  ('workshops',                    'select',  'no', 'si',    'si',    'si'),
  ('workshops',                    'insert',  'no', 'si',    'no',    'si'),
  ('workshops',                    'update',  'no', 'si',    'no',    'si'),
  ('workshops',                    'delete',  'no', 'si',    'no',    'no'),
  ('storage.buckets',              'select',  'no', 'no',    'no',    'no'),
  ('storage.buckets',              'insert',  'no', 'no',    'no',    'no'),
  ('storage.buckets',              'update',  'no', 'no',    'no',    'no'),
  ('storage.buckets',              'delete',  'no', 'no',    'no',    'no'),
  ('storage.objects',              'select',  'no', 'filas', 'filas', 'filas'),
  ('storage.objects',              'insert',  'no', 'si',    'filas', 'filas'),
  ('storage.objects',              'update',  'no', 'filas', 'no',    'no'),
  ('storage.objects',              'delete',  'no', 'filas', 'filas', 'filas');

select plan((select count(*)::int * 4 from matriz) + 6);

select set_eq(
  $$ select tabla from matriz $$,
  $$ select c.oid::regclass::text from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
     union select 'storage.buckets' union select 'storage.objects' $$,
  'la matriz cubre todas las tablas y vistas de public'
);

select is(pg_temp.acceso(m.tabla::regclass, m.operacion, r.rol), r.esperado,
          format('%s: %s en %s', r.rol, m.operacion, m.tabla))
from matriz m
cross join lateral (values ('anon', m.anon), ('admin', m.admin), ('ventas', m.ventas),
                           ('logistica', m.logistica)) r(rol, esperado)
order by m.tabla, m.operacion, r.rol;

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'todas las tablas de public tienen RLS'
);

select is_empty(
  $$ select c.oid::regclass::text || ' ' || p.priv from pg_class c
     cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
     cross join unnest(array['anon', 'authenticated']) r(rol)
     where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
       and c.relkind in ('r', 'v', 'p') and has_table_privilege(r.rol, c.oid, p.priv) $$,
  'ningún usuario puede vaciar tablas (TRUNCATE no pasa por RLS), referenciarlas ni ponerles triggers'
);

select is_empty(
  $$ select c.oid::regclass::text from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
       and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage, select, update') end $$,
  'un anónimo no usa las secuencias'
);

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute') $$,
  'un anónimo no ejecuta funciones de public'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('anon', 'audit', 'usage')
    and not has_schema_privilege('authenticated', 'audit', 'usage'),
  'los esquemas private y audit no están expuestos'
);

select * from finish();
rollback;
