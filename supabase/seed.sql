-- Datos de prueba para el entorno local (se cargan con `pnpm db:reset`). Nunca se aplican en producción.

-- Un usuario por rol. Contraseña de todos: Pereda-local-2026
with semillas (id, email, rol, nombre) as (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@pereda.test', 'admin', 'Admin de prueba'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'ventas@pereda.test', 'ventas', 'Ventas de prueba'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'logistica@pereda.test', 'logistica', 'Logística de prueba')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('Pereda-local-2026', extensions.gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', rol),
  jsonb_build_object('full_name', nombre), now(), now(),
  '', '', '', '', '', '', '', ''
from semillas;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users
where email like '%@pereda.test';

-- ---------------------------------------------------------------------------------------
-- Datos de negocio: pocos talleres, clientes, 3 restauraciones y 10 piezas en estados
-- variados, con fotos de antes y después.
--
-- Todo se registra como lo haría la app (como el usuario del rol que corresponde y con
-- las mismas funciones), así salen el historial, la auditoría y los totales. Como cada
-- acción guarda `now()`, después de cada paso `pg_temp.retrodatar` mueve a la fecha del
-- paso todo lo que se escribió desde el arranque del seed; así la línea de tiempo y los
-- días en taller se ven reales. Los pasos van en orden cronológico.
--
-- Las fotos están en `supabase/seed-files/restoration-files/` y la CLI las sube al bucket
-- (ver `[storage.buckets.restoration-files]` en config.toml); aquí solo se registran.
-- ---------------------------------------------------------------------------------------

-- `now()` y no `clock_timestamp()`: si el seed corre en una sola transacción, todo lo
-- escrito lleva exactamente esta hora.
create temp table seed_reloj as select now() as inicio;

-- Día y hora de Lima, `p_dias` días atrás.
create function pg_temp.lima(p_dias integer, p_hora time)
returns timestamptz
language sql
as $$
  select ((now() at time zone 'America/Lima')::date - p_dias + p_hora) at time zone 'America/Lima';
$$;

-- Lleva a `p_en` las fechas escritas desde el arranque del seed (sin disparar triggers:
-- no son cambios de negocio).
create function pg_temp.retrodatar(p_en timestamptz)
returns void
language plpgsql
as $$
declare
  v_desde timestamptz := (select inicio from seed_reloj);
  v_tabla text;
begin
  foreach v_tabla in array array[
    'workshops', 'materials', 'services', 'clients', 'contacts', 'restorations', 'pieces',
    'piece_status_history', 'payments', 'restoration_files', 'audit_log'
  ] loop
    execute format('alter table public.%I disable trigger user', v_tabla);
  end loop;

  update public.workshops set created_at = p_en, updated_at = p_en where updated_at >= v_desde;
  update public.materials set created_at = p_en, updated_at = p_en where updated_at >= v_desde;
  update public.services set created_at = p_en, updated_at = p_en where updated_at >= v_desde;
  update public.clients set created_at = p_en, updated_at = p_en where updated_at >= v_desde;
  update public.contacts set created_at = p_en, updated_at = p_en where updated_at >= v_desde;
  update public.restorations set
    created_at = case when created_at >= v_desde then p_en else created_at end,
    updated_at = p_en
  where updated_at >= v_desde;
  update public.pieces set
    created_at = case when created_at >= v_desde then p_en else created_at end,
    updated_at = p_en,
    arrived_at = case when arrived_at >= v_desde then p_en else arrived_at end,
    approved_at = case when approved_at >= v_desde then p_en else approved_at end,
    first_sent_at = case when first_sent_at >= v_desde then p_en else first_sent_at end,
    last_sent_at = case when last_sent_at >= v_desde then p_en else last_sent_at end,
    last_returned_at = case when last_returned_at >= v_desde then p_en else last_returned_at end,
    delivered_at = case when delivered_at >= v_desde then p_en else delivered_at end,
    cancelled_at = case when cancelled_at >= v_desde then p_en else cancelled_at end,
    returned_at = case when returned_at >= v_desde then p_en else returned_at end,
    observed_at = case when observed_at >= v_desde then p_en else observed_at end,
    review_sent_at = case when review_sent_at >= v_desde then p_en else review_sent_at end,
    review_returned_at = case when review_returned_at >= v_desde then p_en else review_returned_at end
  where updated_at >= v_desde;
  update public.piece_status_history set occurred_at = p_en where occurred_at >= v_desde;
  update public.payments set created_at = p_en, paid_on = (p_en at time zone 'America/Lima')::date
  where created_at >= v_desde;
  update public.restoration_files set created_at = p_en where created_at >= v_desde;
  update public.audit_log set occurred_at = p_en where occurred_at >= v_desde;

  foreach v_tabla in array array[
    'workshops', 'materials', 'services', 'clients', 'contacts', 'restorations', 'pieces',
    'piece_status_history', 'payments', 'restoration_files', 'audit_log'
  ] loop
    execute format('alter table public.%I enable trigger user', v_tabla);
  end loop;
end;
$$;

-- Fotos del seed: el tamaño es el de los archivos en supabase/seed-files.
create temp table seed_fotos (restoration_id uuid, piece_id uuid, nombre text, category public.file_category, size_bytes integer);
insert into seed_fotos values
  ('30000000-0000-0000-0000-000000000001', null, 'recepcion.jpg', 'antes', 21683),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'antes.jpg', 'antes', 13801),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'despues.jpg', 'despues', 15082),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'antes.jpg', 'antes', 17838),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'despues.jpg', 'despues', 18866),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'antes.jpg', 'antes', 13657),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'despues.jpg', 'despues', 14663),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'antes.jpg', 'antes', 13232),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'despues.jpg', 'despues', 13481),
  ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000005', 'antes.jpg', 'antes', 13726),
  ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006', 'antes.jpg', 'antes', 13317),
  ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000007', 'antes.jpg', 'antes', 11388),
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000008', 'antes.jpg', 'antes', 17066),
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000009', 'antes.jpg', 'antes', 13423),
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000010', 'antes.jpg', 'antes', 13604);
grant select on seed_fotos to authenticated;

-- Registra las fotos indicadas (como el usuario actual).
create function pg_temp.registrar_fotos(p_restoration_id uuid, p_piece_ids uuid[], p_category public.file_category)
returns void
language sql
as $$
  insert into public.restoration_files (restoration_id, piece_id, path, name, mime_type, size_bytes, category)
  select f.restoration_id, f.piece_id,
    'restorations/' || f.restoration_id || '/'
      || coalesce('pieces/' || f.piece_id || '/', 'general/') || f.nombre,
    f.nombre, 'image/jpeg', f.size_bytes, f.category
  from seed_fotos f
  where f.restoration_id = p_restoration_id
    and (f.piece_id = any (p_piece_ids) or (f.piece_id is null and p_piece_ids is null))
    and f.category = p_category;
$$;
grant execute on function pg_temp.registrar_fotos(uuid, uuid[], public.file_category) to authenticated;

-- Hace 30 días: catálogos, talleres y clientes. ---------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', false);

insert into public.materials (name) values ('Plata 950'), ('Plata 925'), ('Alpaca'), ('Bronce plateado');
insert into public.services (name, suggested_price) values
  ('Limpieza y pulido', 80), ('Soldadura', 120), ('Baño de plata', 220), ('Restauración integral', 450);

insert into public.workshops (id, name, contact_name, phone, address, notes) values
  ('20000000-0000-0000-0000-000000000001', 'Taller Huamán', 'Julio Huamán', '+51987654321',
   'Jr. Huaraz 1450, Breña, Lima', 'Pulido, soldadura y baños. Recoge los martes y viernes.'),
  ('20000000-0000-0000-0000-000000000002', 'Orfebrería Ríos', 'Rosa Ríos', '+51976543210',
   'Av. Petit Thouars 2380, Lince, Lima', 'Restauraciones integrales y repujado.');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);

insert into public.clients (id, kind, first_name, last_name, document_type, document_number, phone, email, address, city) values
  ('50000000-0000-0000-0000-000000000001', 'persona', 'María', 'Fernández Rojas', 'dni', '70123456',
   '+51987111222', 'maria.fernandez@example.com', 'Calle Los Pinos 245, Miraflores', 'Lima'),
  ('50000000-0000-0000-0000-000000000002', 'persona', 'Jorge', 'Salazar Paredes', 'dni', '40981234',
   '+51998333444', 'jorge.salazar@example.com', 'Av. Ejército 812, Yanahuara', 'Arequipa');
insert into public.clients (id, kind, legal_name, document_type, document_number, phone, email, address, city) values
  ('50000000-0000-0000-0000-000000000003', 'empresa', 'Hotel Colonial Lima S.A.C.', 'ruc', '20512345678',
   '+5114261234', 'compras@hotelcolonial.example.com', 'Jr. Ucayali 320, Cercado de Lima', 'Lima');
insert into public.contacts (id, client_id, first_name, last_name, position, phone, email) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'Lucía', 'Torres',
   'Jefa de compras', '+51955666777', 'lucia.torres@hotelcolonial.example.com');

reset role;
select pg_temp.retrodatar(pg_temp.lima(30, '09:00'));

-- Hace 12 días: RES 1 (María, contado), registrada por el admin con precios. --------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', false);

-- Con id fijo (la ruta de las fotos lo usa): la app no puede elegirlo, así que se inserta
-- como postgres, pero a nombre del usuario de la sesión.
reset role;
insert into public.restorations (id, client_id, payment_type, notes) values
  ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'contado',
   'Piezas de la familia; la clienta pide cuidado con el grabado del candelabro.');
insert into public.pieces (id, restoration_id, description, measure, material_id, material_name,
  service_id, service_name, weight_grams, price, urgent)
select v.id, '30000000-0000-0000-0000-000000000001', v.description, v.measure, m.id, m.name, s.id, s.name,
  v.weight, v.price, v.urgent
from (values
  ('40000000-0000-0000-0000-000000000001'::uuid, 'Bandeja ovalada con asas', '45 x 30 cm', 'Plata 950', 'Limpieza y pulido', 820.0, 180.0, false, 1),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'Juego de 6 cucharitas', '12 cm', 'Plata 925', 'Baño de plata', 150.0, 220.0, false, 2),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'Candelabro de tres brazos', '38 cm de alto', 'Plata 950', 'Soldadura', 1250.0, 350.0, true, 3),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'Marco de foto repujado', '20 x 25 cm', 'Alpaca', 'Limpieza y pulido', null, 90.0, false, 4)
) as v (id, description, measure, material, service, weight, price, urgent, orden)
join public.materials m on m.name = v.material
join public.services s on s.name = v.service
order by v.orden;
set role authenticated;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select pg_temp.registrar_fotos('30000000-0000-0000-0000-000000000001', null, 'antes');
select pg_temp.registrar_fotos('30000000-0000-0000-0000-000000000001',
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004']::uuid[], 'antes');

reset role;
select pg_temp.retrodatar(pg_temp.lima(12, '10:30'));

-- Hace 11 días: la clienta aprueba y paga todo con tarjeta. -------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);

select public.change_piece_status(
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004']::uuid[],
  'aprobada');
insert into public.payments (restoration_id, amount, payment_method_id)
select r.id, r.total, (select id from public.payment_methods where name = 'Tarjeta')
from public.restorations r where r.id = '30000000-0000-0000-0000-000000000001';

reset role;
select pg_temp.retrodatar(pg_temp.lima(11, '12:15'));

-- Hace 10 días: logística las lleva al Taller Huamán. --------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', false);

select public.send_pieces_to_workshop(
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004']::uuid[],
  '20000000-0000-0000-0000-000000000001');
select public.set_piece_service_cost('40000000-0000-0000-0000-000000000001', 60);
select public.set_piece_service_cost('40000000-0000-0000-0000-000000000002', 90);
select public.set_piece_service_cost('40000000-0000-0000-0000-000000000003', 140);
select public.set_piece_service_cost('40000000-0000-0000-0000-000000000004', 30);

reset role;
select pg_temp.retrodatar(pg_temp.lima(10, '16:00'));

-- Hace 9 días: RES 2 (Jorge, a cuenta con S/ 200 de adelanto por Yape). -------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', false);

reset role;
insert into public.restorations (id, client_id, payment_type, deposit_amount, notes) values
  ('30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'a_cuenta', 200,
   'Envía las piezas desde Arequipa; devolver por Olva Courier.');
insert into public.pieces (id, restoration_id, description, measure, material_id, material_name,
  service_id, service_name, weight_grams, price, urgent, notes)
select v.id, '30000000-0000-0000-0000-000000000002', v.description, v.measure, m.id, m.name, s.id, s.name,
  v.weight, v.price, v.urgent, v.notes
from (values
  ('40000000-0000-0000-0000-000000000005'::uuid, 'Jarra de agua', '28 cm de alto', 'Plata 950', 'Restauración integral', 1100.0, 650.0, false, 'Abolladura en la base', 1),
  ('40000000-0000-0000-0000-000000000006'::uuid, 'Azucarera con tapa', '14 cm', 'Plata 925', 'Soldadura', 380.0, 150.0, false, 'Asa izquierda suelta', 2),
  ('40000000-0000-0000-0000-000000000007'::uuid, 'Cáliz antiguo', '22 cm de alto', 'Plata 950', 'Baño de plata', 420.0, 260.0, true, 'Lo necesita para un bautizo', 3)
) as v (id, description, measure, material, service, weight, price, urgent, notes, orden)
join public.materials m on m.name = v.material
join public.services s on s.name = v.service
order by v.orden;
set role authenticated;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select pg_temp.registrar_fotos('30000000-0000-0000-0000-000000000002',
  array['40000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006',
        '40000000-0000-0000-0000-000000000007']::uuid[], 'antes');
-- El adelanto con que se registra es un pago (igual que en la app).
insert into public.payments (restoration_id, amount, payment_method_id) values
  ('30000000-0000-0000-0000-000000000002', 200, (select id from public.payment_methods where name = 'Yape'));

reset role;
select pg_temp.retrodatar(pg_temp.lima(9, '11:00'));

-- Hace 8 días: Jorge aprueba; la jarra va a Orfebrería Ríos. ------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select public.change_piece_status(
  array['40000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006',
        '40000000-0000-0000-0000-000000000007']::uuid[],
  'aprobada');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', false);
select public.send_pieces_to_workshop(
  array['40000000-0000-0000-0000-000000000005']::uuid[],
  '20000000-0000-0000-0000-000000000002');
select public.set_piece_service_cost('40000000-0000-0000-0000-000000000005', 280);

reset role;
select pg_temp.retrodatar(pg_temp.lima(8, '15:30'));

-- Hace 3 días: vuelven del taller la bandeja, las cucharitas y el marco; la azucarera
-- va al Taller Huamán. -------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', false);

select public.receive_from_workshop(
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000004']::uuid[]);
select pg_temp.registrar_fotos('30000000-0000-0000-0000-000000000001',
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000004']::uuid[], 'despues');
select public.send_pieces_to_workshop(
  array['40000000-0000-0000-0000-000000000006']::uuid[],
  '20000000-0000-0000-0000-000000000001');
select public.set_piece_service_cost('40000000-0000-0000-0000-000000000006', 50);

reset role;
select pg_temp.retrodatar(pg_temp.lima(3, '17:00'));

-- Hace 2 días: se entrega la bandeja, el marco queda observado y llega RES 3 (hotel,
-- crédito, aún sin precios: pasan a Consulta). --------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);

select public.change_piece_status(array['40000000-0000-0000-0000-000000000001']::uuid[], 'entregada');
select public.change_piece_status(array['40000000-0000-0000-0000-000000000004']::uuid[], 'observada',
  'La clienta nota rayas en el borde inferior; hay que volver a pulirlo.');

reset role;
insert into public.restorations (id, client_id, contact_id, payment_type, notes) values
  ('30000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003',
   '60000000-0000-0000-0000-000000000001', 'credito', 'Factura a 30 días. Coordinar con Lucía.');
insert into public.pieces (id, restoration_id, description, measure, material_id, material_name,
  service_id, service_name, weight_grams, notes)
select v.id, '30000000-0000-0000-0000-000000000003', v.description, v.measure, m.id, m.name, s.id, s.name,
  v.weight, v.notes
from (values
  ('40000000-0000-0000-0000-000000000008'::uuid, 'Fuente redonda grande', '50 cm de diámetro', 'Plata 950', 'Limpieza y pulido', 1600.0, '', 1),
  ('40000000-0000-0000-0000-000000000009'::uuid, 'Tetera estilo colonial', '24 cm de alto', 'Plata 925', 'Restauración integral', 950.0, 'Falta la tapa original', 2),
  ('40000000-0000-0000-0000-000000000010'::uuid, 'Cofre joyero', '18 x 12 cm', 'Alpaca', 'Soldadura', null, 'Bisagra rota', 3)
) as v (id, description, measure, material, service, weight, notes, orden)
join public.materials m on m.name = v.material
join public.services s on s.name = v.service
order by v.orden;
set role authenticated;
select pg_temp.registrar_fotos('30000000-0000-0000-0000-000000000003',
  array['40000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000009',
        '40000000-0000-0000-0000-000000000010']::uuid[], 'antes');
-- Sin precio de venta pasan a Consulta, como al registrar desde la app.
select public.change_piece_status(
  array['40000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000009',
        '40000000-0000-0000-0000-000000000010']::uuid[],
  'en_consulta', private.unpriced_note());

reset role;
select pg_temp.retrodatar(pg_temp.lima(2, '11:45'));

-- Ayer en la mañana: el cofre espera la respuesta del cliente.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select public.change_piece_status(array['40000000-0000-0000-0000-000000000010']::uuid[], 'en_espera');

reset role;
select pg_temp.retrodatar(pg_temp.lima(1, '10:00'));

-- Ayer en la tarde: el hotel no acepta el arreglo del cofre (queda por devolver) y
-- vuelve el candelabro del taller. -------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select public.change_piece_status(array['40000000-0000-0000-0000-000000000010']::uuid[], 'rechazada',
  'El cliente prefiere no arreglarlo por el costo.');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', false);
select public.receive_from_workshop(array['40000000-0000-0000-0000-000000000003']::uuid[]);
select pg_temp.registrar_fotos('30000000-0000-0000-0000-000000000001',
  array['40000000-0000-0000-0000-000000000003']::uuid[], 'despues');

reset role;
select pg_temp.retrodatar(pg_temp.lima(1, '17:30'));

-- Hoy: se entregan las cucharitas (salen en la vista de piezas hasta el fin del día). -
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
select public.change_piece_status(array['40000000-0000-0000-0000-000000000002']::uuid[], 'entregada');
reset role;

select set_config('request.jwt.claims', '', false);

-- Nada de esto debe llegar a una tienda de Shopify real si alguien corre
-- `pnpm shopify:sync` en local.
delete from public.shopify_sync_jobs;
