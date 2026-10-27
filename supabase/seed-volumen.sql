-- Datos de demostración con volumen para el Dashboard (Fase 13). NO se carga con
-- `pnpm db:reset`: se aplica a mano sobre la BD local, después del seed normal:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed-volumen.sql
--
-- Crea ~110 guías de los últimos 120 días (con piezas, viajes al taller, pagos y algún
-- reembolso), 2 vendedores más, 3 talleres, 40 clientes, cotizaciones de WhatsApp y del
-- cotizador. Es determinista (misma semilla = mismos datos) y solo para el entorno local.
-- Escribe directo en las tablas (no usa las funciones de la app): por eso reconstruye el
-- historial de cada pieza y, al final, borra las alertas que generaron los disparadores.

begin;
select setseed(0.37);
create temp table seed_plan (pid uuid, rid uuid, fate text, created timestamptz, appr timestamptz, sent timestamptz, ret timestamptz, deliv timestamptz, wk integer, cost numeric, g integer);
set constraints all immediate;
select set_config('app.deliver_with_balance', 'on', true);

-- ---------------------------------------------------------------------------------------
-- Equipo: dos vendedores más (se entra con la contraseña de siempre: Pereda-local-2026)
-- ---------------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'carla@pereda.test',
   extensions.crypt('Pereda-local-2026', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"ventas"}', '{"full_name":"Carla Quispe"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'diego@pereda.test',
   extensions.crypt('Pereda-local-2026', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"ventas"}', '{"full_name":"Diego Rojas"}', now(), now(), '', '', '', '', '', '', '', '')
on conflict do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email in ('carla@pereda.test', 'diego@pereda.test')
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

insert into public.workshops (id, name, contact_name) values
  ('50000000-0000-0000-0000-000000000001', 'Taller San Marcos', 'Don Efraín'),
  ('50000000-0000-0000-0000-000000000002', 'Platería Los Andes', 'Sra. Julia'),
  ('50000000-0000-0000-0000-000000000003', 'Orfebres del Centro', 'Marco')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------
-- Los pagos se escriben con su fecha real y sin colas hacia Shopify.
alter table public.payments disable trigger payments_prepare;
alter table public.payments disable trigger payments_enqueue_sync;
alter table public.payments disable trigger payments_shopify_order;

-- Todo lo demás en un bloque, con funciones auxiliares locales
-- ---------------------------------------------------------------------------------------
do $$
declare
  v_sellers uuid[] := array[
    '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001'
  ]::uuid[];
  -- Cuánto tarda cada taller (días promedio): hay uno rápido, dos normales y uno lento.
  v_workshops uuid[] := array[
    '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000003'
  ]::uuid[];
  v_wspeed numeric[] := array[4.5, 8.5, 13]::numeric[];
  v_services uuid[] := (select array_agg(id order by name) from public.services);
  v_materials uuid[] := (select array_agg(id order by name) from public.materials);
  v_methods text[] := array['Yape','Yape','Yape','Efectivo','Efectivo','Efectivo','Tarjeta','Tarjeta','Plin'];
  v_prices numeric[] := array[45,60,80,95,120,150,180,220,280,350,420,520];
  v_first text[] := array['Lucía','Mateo','Valeria','Santiago','Camila','Joaquín','Renata','Gabriel','Sofía','Álvaro','Daniela','Ricardo','Paula','Hugo','Mónica','Iván','Elena','Bruno','Rosa','Andrés'];
  v_last text[] := array['Salazar','Medina','Paredes','Vargas','Castillo','Rivera','Huamán','Torres','Flores','Mendoza','Cárdenas','Ramos','Soto','Chávez','Núñez'];
  v_regions text[] := array['LIM','LIM','LIM','LIM','LIM','LIM','AREQ','ARE','CUS','CUS','LAL','PIU','JUN','ICA'];
  v_discard text[] := array['Muy caro','Muy caro','Encontró otro taller','No respondió','Plazo muy largo','Ya no lo necesita','muy caro '];
  v_clients uuid[] := '{}';
  v_client uuid;
  v_i integer;
  v_g integer;
  v_p integer;
  v_age integer;
  v_seller uuid;
  v_rid uuid;
  v_pid uuid;
  v_created timestamptz;
  v_ptype public.payment_type;
  v_kind text;
  v_npieces integer;
  v_price numeric;
  v_qty integer;
  v_roll numeric;
  v_fate text;
  v_wk integer;
  v_wdays integer;
  v_appr timestamptz;
  v_sent timestamptz;
  v_ret timestamptz;
  v_deliv timestamptz;
  v_now timestamptz := now();
  v_cost numeric;
  v_svc uuid[];
  v_status public.piece_status;
  v_urgent boolean;
  v_cwa_id uuid;
  v_item_ids uuid[];
  v_has_cost boolean;
  r record;
begin
  -- Clientes ---------------------------------------------------------------------------
  for v_i in 1..40 loop
    v_created := v_now - make_interval(days => (random() * 170)::int, hours => (random() * 9)::int);
    if v_i <= 34 then
      insert into public.clients (kind, first_name, last_name, region, created_at, created_by)
      values ('persona', v_first[1 + (v_i % 20)], v_last[1 + ((v_i * 7) % 15)],
              replace(v_regions[1 + (random() * 13)::int], 'AREQ', 'ARE'),
              v_created, '10000000-0000-0000-0000-000000000002')
      returning id into v_client;
    else
      insert into public.clients (kind, legal_name, document_type, document_number, region, created_at, created_by)
      values ('empresa', (array['Joyería','Hotel','Restaurante','Comercial','Inversiones','Casa'])[1 + (v_i % 6)] || ' ' || (array['Inti','Qori','Pachamama','Altiplano','Wari','Illari'])[1 + (v_i % 6)] || ' SAC',
              'ruc', '2051' || lpad(v_i::text, 7, '0'),
              replace(v_regions[1 + (random() * 13)::int], 'AREQ', 'ARE'), v_created, '10000000-0000-0000-0000-000000000002')
      returning id into v_client;
    end if;
    v_clients := v_clients || v_client;
  end loop;

  -- Guías normales de los últimos 120 días (más densas hacia hoy) -----------------------
  for v_g in 1..112 loop
    v_age := floor(120 * power(random(), 1.6))::int;
    v_created := date_trunc('day', v_now) - make_interval(days => v_age) + make_interval(hours => 14 + (random() * 7)::int, mins => (random() * 59)::int);
    if v_created > v_now then v_created := v_now - interval '2 hours'; end if;
    v_seller := v_sellers[1 + (random() * (array_length(v_sellers, 1) - 1))::int];
    -- Los clientes tienen preferidos: algunos vuelven mucho.
    v_client := v_clients[1 + floor(random() * random() * 40)::int];
    v_roll := random();
    v_ptype := case when v_roll < 0.55 then 'contado' when v_roll < 0.85 then 'a_cuenta' else 'credito' end;
    v_kind := case when v_g % 23 = 0 then 'interno' else 'normal' end;
    if v_kind = 'interno' then v_ptype := 'sin_definir'; end if;

    insert into public.restorations (client_id, payment_type, created_by, created_at, kind)
    values (v_client, v_ptype, v_seller, v_created, v_kind::public.restoration_kind)
    returning id into v_rid;

    v_npieces := 1 + (random() * random() * 4)::int;
    for v_p in 1..v_npieces loop
      v_price := v_prices[1 + (random() * 11)::int];
      v_qty := case when random() < 0.85 then 1 else 2 + (random() * 2)::int end;
      v_svc := case when random() < 0.8 then array[v_services[1 + (random() * 3)::int]]
                    else array[v_services[1 + (random() * 3)::int], v_services[1 + (random() * 3)::int]] end;
      v_urgent := random() < 0.08;
      v_has_cost := random() < 0.8;
      v_wk := 1 + (random() * 2)::int;
      v_wk := case when random() < 0.45 then 1 when random() < 0.6 then 2 else 3 end;
      v_wdays := greatest(1, round(v_wspeed[v_wk] * (0.55 + random() * 0.9))::int);
      v_cost := case when v_has_cost then round(v_price * (0.3 + random() * 0.25)) else null end;
      v_roll := random();

      -- Destino de la pieza según su antigüedad.
      v_fate := case
        when v_kind = 'interno' then 'interna'
        when v_age > 35 then case when v_roll < 0.80 then 'entregada' when v_roll < 0.88 then 'rechazada' when v_roll < 0.93 then 'anulada' when v_roll < 0.97 then 'sin_arreglo' else 'lista' end
        when v_age > 10 then case when v_roll < 0.45 then 'entregada' when v_roll < 0.62 then 'taller' when v_roll < 0.72 then 'lista' when v_roll < 0.84 then 'espera' when v_roll < 0.92 then 'rechazada' else 'anulada' end
        else case when v_roll < 0.15 then 'registrada' when v_roll < 0.40 then 'consulta' when v_roll < 0.55 then 'espera' when v_roll < 0.75 then 'aprobada' else 'taller' end
      end;

      v_appr := v_created + make_interval(days => (random() * 3)::int, hours => 1 + (random() * 4)::int);
      v_sent := v_appr + make_interval(days => (random() * 2)::int, hours => 1 + (random() * 3)::int);
      v_ret := v_sent + make_interval(days => v_wdays);
      v_deliv := v_ret + make_interval(days => (random() * 4)::int, hours => 1 + (random() * 5)::int);

      insert into public.pieces (restoration_id, description, price, quantity, urgent, service_ids, material_ids, service_cost, workshop_id, created_at)
      values (v_rid,
              (array['Fuente ovalada','Juego de cubiertos','Candelabro','Bandeja de servicio','Tetera','Cáliz','Marco de espejo','Jarra','Azucarera','Plato de mesa','Cruz procesional','Charola'])[1 + (random() * 11)::int],
              case when v_kind = 'interno' then null else v_price end, v_qty, v_urgent,
              v_svc, array[v_materials[1 + (random() * 3)::int]],
              case when v_fate in ('registrada','consulta','espera') then null else v_cost end,
              case when v_fate in ('entregada','taller','lista','interna') then v_workshops[v_wk] else null end,
              v_created)
      returning id into v_pid;

      insert into seed_plan values (v_pid, v_rid, v_fate, v_created, v_appr, v_sent, v_ret, v_deliv, v_wk, v_cost, v_g);
    end loop;
  end loop;

  -- Segunda pasada: con todas las piezas creadas se fijan estados, fechas e historial
  -- (si no, la guía se cierra con su primera pieza y rechaza a las demás).
  for r in select * from seed_plan order by g loop
    v_pid := r.pid; v_rid := r.rid; v_fate := r.fate; v_created := r.created; v_appr := r.appr;
    v_sent := r.sent; v_ret := r.ret; v_deliv := r.deliv; v_wk := r.wk; v_cost := r.cost; v_g := r.g;
    -- Fechas y estado final (si algo cae en el futuro, la pieza se queda en la etapa anterior).
    if v_fate = 'entregada' and v_deliv > v_now then v_fate := case when v_ret > v_now then 'taller' else 'lista' end; end if;
    if v_fate = 'taller' and v_ret <= v_now - interval '1 day' then v_fate := 'lista'; end if;
    if v_fate in ('taller','lista','entregada') and v_sent > v_now then v_fate := 'aprobada'; end if;
    if v_fate in ('aprobada','taller','lista','entregada') and v_appr > v_now then v_fate := 'consulta'; end if;
    -- Una sola pieza de cada guía viene "en taller" por demasiado tiempo: para el semáforo.
    if v_fate = 'taller' and v_g % 17 = 0 then v_sent := v_now - interval '19 days'; end if;

    delete from public.piece_status_history where piece_id = v_pid;
    insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
    values (v_pid, v_rid, 'estado', null, 'registrada', v_created);

    if v_fate = 'interna' then
      update public.pieces set status = 'aprobada', approved_at = v_created, first_sent_at = v_sent, last_sent_at = v_sent,
             last_returned_at = case when v_ret <= v_now then v_ret end, workshop_id = v_workshops[v_wk],
             service_cost = coalesce(v_cost, 30)
      where id = v_pid;
      insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, workshop_id, occurred_at)
      values (v_pid, v_rid, 'envio_taller', 'aprobada', 'aprobada', v_workshops[v_wk], v_sent);
      if v_ret <= v_now then
        insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
        values (v_pid, v_rid, 'vuelta_taller', 'aprobada', 'aprobada', v_ret);
      end if;
    elsif v_fate = 'registrada' then
      null;
    elsif v_fate in ('consulta','espera') then
      v_status := case v_fate when 'consulta' then 'en_consulta' else 'en_espera' end;
      update public.pieces set status = v_status where id = v_pid;
      insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
      values (v_pid, v_rid, 'estado', 'registrada', v_status, v_created + interval '1 hour');
    elsif v_fate in ('rechazada','anulada','sin_arreglo') then
      v_status := v_fate::public.piece_status;
      update public.pieces set status = v_status, approved_at = case when v_fate = 'anulada' and random() < 0.5 then v_appr end,
             cancelled_at = case when v_fate = 'anulada' then v_appr + interval '1 day' end
      where id = v_pid;
      insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
      values (v_pid, v_rid, 'estado', 'registrada', v_status, v_appr + interval '1 day');
    else
      -- aprobada, en taller, lista para entregar o entregada
      update public.pieces set status = case when v_fate = 'entregada' then 'entregada'::public.piece_status else 'aprobada'::public.piece_status end,
             approved_at = v_appr,
             first_sent_at = case when v_fate <> 'aprobada' then v_sent end,
             last_sent_at = case when v_fate <> 'aprobada' then v_sent end,
             last_returned_at = case when v_fate in ('lista','entregada') then v_ret end,
             delivered_at = case when v_fate = 'entregada' then v_deliv end,
             arrived_at = case when v_fate in ('lista','entregada') then v_ret end
      where id = v_pid;
      insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
      values (v_pid, v_rid, 'estado', 'registrada', 'aprobada', v_appr);
      if v_fate <> 'aprobada' then
        insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, workshop_id, occurred_at)
        values (v_pid, v_rid, 'envio_taller', 'aprobada', 'aprobada', v_workshops[v_wk], v_sent);
      end if;
      if v_fate in ('lista','entregada') then
        insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
        values (v_pid, v_rid, 'vuelta_taller', 'aprobada', 'aprobada', v_ret);
      end if;
      if v_fate = 'entregada' then
        insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, occurred_at)
        values (v_pid, v_rid, 'estado', 'aprobada', 'entregada', v_deliv);
      end if;
    end if;
  end loop;

  -- Pagos de las guías con piezas aprobadas ----------------------------------------------
  for r in
    select re.id, re.payment_type, re.created_by, re.created_at,
           coalesce(sum(private.piece_amount(p.price, p.quantity)) filter (
             where p.approved_at is not null and p.status not in ('anulada','rechazada','sin_arreglo')), 0) as approved,
           min(p.approved_at) filter (where p.approved_at is not null) as first_appr,
           max(p.delivered_at) as last_deliv,
           bool_and(p.status in ('entregada','anulada','rechazada','sin_arreglo')) as all_closed
    from public.restorations re
    join public.pieces p on p.restoration_id = re.id
    where re.kind = 'normal'
    group by re.id
    having coalesce(sum(private.piece_amount(p.price, p.quantity)) filter (
             where p.approved_at is not null and p.status not in ('anulada','rechazada','sin_arreglo')), 0) > 0
  loop
    if r.payment_type = 'contado' then
      insert into public.payments (restoration_id, kind, amount, method_name, paid_on, created_by_name, created_at)
      values (r.id, 'pago', r.approved, v_methods[1 + (random() * 8)::int],
              (r.first_appr at time zone 'America/Lima')::date, 'Demo', r.first_appr);
    elsif r.payment_type = 'a_cuenta' then
      insert into public.payments (restoration_id, kind, amount, method_name, paid_on, created_by_name, created_at)
      values (r.id, 'pago', round(r.approved / 2), v_methods[1 + (random() * 8)::int],
              (r.first_appr at time zone 'America/Lima')::date, 'Demo', r.first_appr);
      if r.all_closed and r.last_deliv is not null then
        insert into public.payments (restoration_id, kind, amount, method_name, paid_on, created_by_name, created_at)
        values (r.id, 'pago', r.approved - round(r.approved / 2), v_methods[1 + (random() * 8)::int],
                (r.last_deliv at time zone 'America/Lima')::date, 'Demo', r.last_deliv);
      end if;
    elsif r.payment_type = 'credito' and r.all_closed and r.last_deliv is not null and random() < 0.6 then
      insert into public.payments (restoration_id, kind, amount, method_name, paid_on, created_by_name, created_at)
      values (r.id, 'pago', r.approved, v_methods[1 + (random() * 8)::int],
              ((r.last_deliv + interval '4 days') at time zone 'America/Lima')::date, 'Demo', r.last_deliv + interval '4 days');
    end if;
  end loop;

  -- Algunos reembolsos parciales
  insert into public.payments (restoration_id, kind, amount, method_name, paid_on, reason, refunded_payment_id, created_by_name, created_at)
  select p.restoration_id, 'reembolso', round(p.amount * 0.15), p.method_name, p.paid_on + 2, 'Ajuste por pieza dañada', p.id, 'Demo', p.created_at + interval '2 days'
  from (select * from public.payments where kind = 'pago' and paid_on < current_date - 3 order by id limit 40) p
  where right(p.id::text, 1) in ('3', '8');

  -- Cotizaciones de WhatsApp: algunas terminan en guía, otras se descartan ------------------
  for v_i in 1..22 loop
    v_created := date_trunc('day', v_now) - make_interval(days => floor(90 * power(random(), 1.4))::int) + make_interval(hours => 15 + (random() * 5)::int);
    v_seller := v_sellers[1 + (random() * (array_length(v_sellers, 1) - 1))::int];
    insert into public.whatsapp_quotes (customer_name, customer_phone, payment_type, created_by, created_at)
    values (v_first[1 + (v_i % 20)] || ' ' || v_last[1 + ((v_i * 3) % 15)], '+519' || lpad((70000000 + v_i * 91)::text, 8, '0'), 'contado', v_seller, v_created)
    returning id into v_cwa_id;
    v_item_ids := '{}';
    for v_p in 1..(2 + (random() * 2)::int) loop
      insert into public.whatsapp_quote_items (quote_id, number, description, price, quantity)
      values (v_cwa_id, v_p, (array['Bandeja','Jarra','Cubiertos','Marco','Candelero'])[1 + (random() * 4)::int], v_prices[1 + (random() * 8)::int], 1)
      returning id into v_pid;
      v_item_ids := v_item_ids || v_pid;
    end loop;
    v_roll := random();
    if v_roll < 0.45 then
      -- Se pide en parte o completa: una guía de origen WhatsApp con las piezas elegidas.
      v_client := v_clients[1 + (random() * 39)::int];
      insert into public.restorations (client_id, payment_type, created_by, created_at, kind, origin, whatsapp_quote_id)
      values (v_client, 'contado', v_seller, v_created + interval '1 day', 'normal', 'whatsapp', v_cwa_id)
      returning id into v_rid;
      for v_p in 1..(case when random() < 0.5 then array_length(v_item_ids, 1) else 1 end) loop
        select i.description, i.price into r from public.whatsapp_quote_items i where i.id = v_item_ids[v_p];
        insert into public.pieces (restoration_id, description, price, quantity, whatsapp_quote_item_id, service_ids, material_ids, created_at, status, approved_at)
        values (v_rid, r.description, r.price, 1, v_item_ids[v_p], array[v_services[1 + (random() * 3)::int]], array[v_materials[1 + (random() * 3)::int]],
                v_created + interval '1 day', case when v_created + interval '2 days' < v_now then 'aprobada' else 'registrada' end::public.piece_status,
                case when v_created + interval '2 days' < v_now then v_created + interval '2 days' end);
      end loop;
      insert into public.payments (restoration_id, kind, amount, method_name, paid_on, created_by_name, created_at)
      select v_rid, 'pago', sum(private.piece_amount(p.price, p.quantity)), 'Yape',
             ((v_created + interval '2 days') at time zone 'America/Lima')::date, 'Demo', v_created + interval '2 days'
      from public.pieces p where p.restoration_id = v_rid and p.approved_at is not null
      having sum(private.piece_amount(p.price, p.quantity)) > 0;
    elsif v_roll < 0.72 then
      update public.whatsapp_quotes set status = 'descartada', discarded_at = v_created + interval '3 days',
             discard_reason = v_discard[1 + (random() * 6)::int]
      where id = v_cwa_id;
    end if;
  end loop;
  -- Estado de cada cotización según lo que se pidió
  update public.whatsapp_quotes q set status = public.derive_whatsapp_quote_status(
      (select count(*)::int from public.whatsapp_quote_items i where i.quote_id = q.id),
      private.whatsapp_quote_ordered_count(q.id))
  where q.status <> 'descartada';

  -- Cotizador de productos (COT) ----------------------------------------------------------
  for v_i in 1..14 loop
    v_created := date_trunc('day', v_now) - make_interval(days => floor(85 * random())::int) + interval '16 hours';
    v_roll := random();
    insert into public.quotes (status, client_id, client_name, validity_days, issue_date, created_by, created_at)
    values (case when v_roll < 0.1 then 'borrador' when v_roll < 0.5 then 'emitida' when v_roll < 0.8 then 'aceptada' else 'rechazada' end::public.quote_status,
            v_clients[1 + (random() * 39)::int], 'Cliente cotizador ' || v_i, 15,
            case when v_roll < 0.1 then null else (v_created at time zone 'America/Lima')::date end,
            v_sellers[1 + (random() * (array_length(v_sellers, 1) - 1))::int], v_created);
  end loop;

  -- Estado general de cada guía a partir de sus piezas ---------------------------------------
  update public.restorations re set status = d.st
  from (
    select re2.id, public.derive_restoration_status(jsonb_agg(jsonb_build_object(
             'status', p.status, 'approvedAt', p.approved_at, 'readyForDelivery', p.ready_for_delivery))) as st
    from public.restorations re2 join public.pieces p on p.restoration_id = re2.id
    where re2.created_at > now() - interval '130 days'
    group by re2.id
  ) d
  where re.id = d.id and d.st is not null and re.status <> d.st;
end;
$$;

alter table public.payments enable trigger payments_prepare;
alter table public.payments enable trigger payments_enqueue_sync;
alter table public.payments enable trigger payments_shopify_order;

-- El seed escribe directo: los disparadores de alertas generaron avisos por cada cambio.
delete from public.notifications;
delete from private.notification_events;

commit;

select 'guías' as dato, count(*) from public.restorations
union all select 'piezas', count(*) from public.pieces
union all select 'pagos', count(*) from public.payments
union all select 'cotizaciones WhatsApp', count(*) from public.whatsapp_quotes;
