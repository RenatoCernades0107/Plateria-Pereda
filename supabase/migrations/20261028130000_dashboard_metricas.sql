-- Métricas del Dashboard (Fase 13, P33, D78).
--
-- Siete funciones `dashboard_*` que devuelven jsonb (el servidor las valida con zod):
-- resumen, ventas, pedidos, clientes, talleres, vendedores y cotizaciones. Todas reciben
-- un rango de fechas de Lima (inclusivo) y solo las pueden llamar admin y ventas
-- (logística, P42, recibe 42501).
--
-- Definiciones (P33):
--   · Vendido  = importe (con techo) de las piezas de guías Normales con `approved_at` en el
--     rango y que siguen vivas (no anuladas, rechazadas ni sin arreglo). Es la misma regla
--     con la que se arma la orden de Shopify.
--   · Cobrado  = pagos − reembolsos por `paid_on` (fecha de Lima).
--   · Saldo por cobrar (hoy) = lo aprobado de la guía − lo pagado, sin bajar de 0.
--   · Vendedor = quien creó la guía (`restorations.created_by`).
-- Costos y márgenes (`service_cost`) solo los recibe el admin; un vendedor de ventas solo
-- ve su propia fila en `dashboard_sellers`.

-- ---------------------------------------------------------------------------------------
-- Índices para las consultas por rango.
-- ---------------------------------------------------------------------------------------
create index if not exists pieces_approved_at_idx
  on public.pieces (approved_at) where approved_at is not null;
create index if not exists pieces_delivered_at_idx
  on public.pieces (delivered_at) where delivered_at is not null;
create index if not exists pieces_created_at_idx on public.pieces (created_at);
create index if not exists payments_paid_on_idx on public.payments (paid_on);
create index if not exists clients_created_at_idx on public.clients (created_at);
create index if not exists restorations_created_by_created_at_idx
  on public.restorations (created_by, created_at);
create index if not exists piece_status_history_event_occurred_idx
  on public.piece_status_history (event, occurred_at);

-- ---------------------------------------------------------------------------------------
-- Ayudas internas (solo las usan las funciones de abajo, que son security definer).
-- ---------------------------------------------------------------------------------------

-- Valida quién llama y el rango; devuelve el rol del usuario.
create or replace function private.dash_guard(
  p_from date, p_to date, p_bucket text default 'dia'
) returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
begin
  if v_role is null or v_role not in ('admin', 'ventas') then
    raise exception 'No tienes permiso para ver el dashboard'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Rango de fechas no válido' using errcode = '22023';
  end if;
  if p_to - p_from > 800 then
    raise exception 'El rango de fechas es demasiado largo' using errcode = '22023';
  end if;
  if p_bucket not in ('dia', 'semana', 'mes') then
    raise exception 'Agrupación no válida' using errcode = '22023';
  end if;
  return v_role;
end;
$$;

-- Inicio (inclusivo) de un día de Lima.
create or replace function private.dash_start(p_day date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select p_day::timestamp at time zone 'America/Lima' $$;

-- Primer día de la agrupación (día, semana que empieza el lunes, o mes) a la que pertenece.
create or replace function private.dash_bucket_of(p_day date, p_bucket text)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc(
    case p_bucket when 'semana' then 'week' when 'mes' then 'month' else 'day' end,
    p_day
  )::date
$$;

-- Todas las agrupaciones del rango, para que las series no tengan huecos.
create or replace function private.dash_buckets(p_from date, p_to date, p_bucket text)
returns table (b date)
language sql
immutable
set search_path = ''
as $$
  select generate_series(
    private.dash_bucket_of(p_from, p_bucket),
    p_to,
    case p_bucket when 'semana' then interval '1 week'
                  when 'mes' then interval '1 month'
                  else interval '1 day' end
  )::date
$$;

-- Piezas vendidas (aprobadas y vivas) con aprobación en el rango.
create or replace function private.dash_sold(p_from date, p_to date)
returns table (
  piece_id uuid,
  restoration_id uuid,
  d date,
  amount numeric,
  cost numeric,
  quantity integer,
  seller uuid,
  origin public.restoration_origin,
  client_id uuid,
  payment_type public.payment_type,
  service_ids uuid[],
  material_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.restoration_id,
         (p.approved_at at time zone 'America/Lima')::date,
         private.piece_amount(p.price, p.quantity),
         p.service_cost, p.quantity, r.created_by, r.origin, r.client_id,
         r.payment_type, p.service_ids, p.material_ids
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where r.kind = 'normal'
    and p.price is not null
    and p.approved_at >= private.dash_start(p_from)
    and p.approved_at < private.dash_start(p_to + 1)
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
$$;

-- Pagos netos (pago − reembolso) con fecha de pago en el rango.
create or replace function private.dash_paid(p_from date, p_to date)
returns table (
  restoration_id uuid,
  d date,
  amount numeric,
  method text,
  seller uuid,
  origin public.restoration_origin,
  client_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select pay.restoration_id, pay.paid_on,
         case pay.kind when 'pago' then pay.amount else -pay.amount end,
         coalesce(nullif(pay.method_name, ''), 'Sin método'),
         r.created_by, r.origin, r.client_id
  from public.payments pay
  join public.restorations r on r.id = pay.restoration_id
  where pay.paid_on between p_from and p_to
$$;

-- Saldo por cobrar de hoy por guía: lo aprobado menos lo pagado.
create or replace function private.dash_due()
returns table (restoration_id uuid, client_id uuid, seller uuid, due numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.client_id, r.created_by,
         greatest(coalesce(a.approved, 0) - r.paid, 0)
  from public.restorations r
  left join lateral (
    select sum(private.piece_amount(p.price, p.quantity)) as approved
    from public.pieces p
    where p.restoration_id = r.id
      and p.approved_at is not null
      and p.price is not null
      and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
  ) a on true
  where r.kind = 'normal'
    and r.status not in ('registrada', 'anulada', 'rechazada')
$$;

-- Piezas que volvieron del taller en el rango (viajes terminados) con sus días en taller.
-- El taller es el del último envío del historial (respaldo: el actual de la pieza).
create or replace function private.dash_workshop_returns(p_from date, p_to date)
returns table (piece_id uuid, workshop_id uuid, days integer, cost numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce((
           select h.workshop_id from public.piece_status_history h
           where h.piece_id = p.id and h.event in ('envio_taller', 'envio_revision')
             and h.workshop_id is not null
           order by h.occurred_at desc, h.id desc limit 1
         ), p.workshop_id),
         wd.days, p.service_cost
  from public.pieces p
  cross join lateral public.workshop_days(private.piece_history_json(p.id), now()) wd
  where p.last_returned_at >= private.dash_start(p_from)
    and p.last_returned_at < private.dash_start(p_to + 1)
    and not wd.ongoing
$$;

revoke execute on function
  private.dash_guard(date, date, text),
  private.dash_start(date),
  private.dash_bucket_of(date, text),
  private.dash_buckets(date, date, text),
  private.dash_sold(date, date),
  private.dash_paid(date, date),
  private.dash_due(),
  private.dash_workshop_returns(date, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Resumen: KPIs del periodo y su serie en el tiempo. Se llama dos veces (periodo y
-- periodo anterior) para los deltas.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_summary(
  p_from date, p_to date, p_bucket text default 'dia'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.dash_guard(p_from, p_to, p_bucket);
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_sold numeric;
  v_sold_orders integer;
  v_sold_pieces integer;
  v_collected numeric;
  v_refunds numeric;
  v_cost_known numeric;
  v_cost numeric;
  v_orders integer;
  v_delivered integer;
  v_ful_avg numeric;
  v_ful_med numeric;
  v_clients integer;
  v_cwa integer;
  v_cwa_conv integer;
  v_due numeric;
  v_series jsonb;
begin
  select coalesce(sum(amount), 0), count(distinct restoration_id), count(*),
         coalesce(sum(amount) filter (where cost is not null), 0),
         coalesce(sum(cost), 0)
    into v_sold, v_sold_orders, v_sold_pieces, v_cost_known, v_cost
  from private.dash_sold(p_from, p_to);

  select coalesce(sum(amount), 0) into v_collected from private.dash_paid(p_from, p_to);
  select coalesce(sum(pay.amount), 0) into v_refunds
  from public.payments pay
  where pay.kind = 'reembolso' and pay.paid_on between p_from and p_to;

  select count(*) into v_orders
  from public.restorations r
  where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end;

  select count(*),
         round(avg(public.lima_days_between(p.created_at, p.delivered_at)), 1),
         round((percentile_cont(0.5) within group (
           order by public.lima_days_between(p.created_at, p.delivered_at)))::numeric, 1)
    into v_delivered, v_ful_avg, v_ful_med
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where r.kind = 'normal' and p.status = 'entregada'
    and p.delivered_at >= v_start and p.delivered_at < v_end;

  select count(*) into v_clients
  from public.clients c where c.created_at >= v_start and c.created_at < v_end;

  select count(*), count(*) filter (where status in ('pedida', 'pedida_parcial'))
    into v_cwa, v_cwa_conv
  from public.whatsapp_quotes q where q.created_at >= v_start and q.created_at < v_end;

  select coalesce(sum(due), 0) into v_due from private.dash_due();

  select coalesce(jsonb_agg(jsonb_build_object(
           'd', b.b,
           'vendido', coalesce(s.v, 0),
           'cobrado', coalesce(c.v, 0),
           'guias', coalesce(o.v, 0)
         ) order by b.b), '[]'::jsonb)
    into v_series
  from private.dash_buckets(p_from, p_to, p_bucket) b
  left join (
    select private.dash_bucket_of(d, p_bucket) k, round(sum(amount), 2) v
    from private.dash_sold(p_from, p_to) group by 1
  ) s on s.k = b.b
  left join (
    select private.dash_bucket_of(d, p_bucket) k, round(sum(amount), 2) v
    from private.dash_paid(p_from, p_to) group by 1
  ) c on c.k = b.b
  left join (
    select private.dash_bucket_of((r.created_at at time zone 'America/Lima')::date, p_bucket) k,
           count(*) v
    from public.restorations r
    where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end
    group by 1
  ) o on o.k = b.b;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', p_bucket,
    'sold', round(v_sold, 2),
    'sold_orders', v_sold_orders,
    'sold_pieces', v_sold_pieces,
    'ticket', case when v_sold_orders > 0 then round(v_sold / v_sold_orders, 2) else 0 end,
    'collected', round(v_collected, 2),
    'refunds', round(v_refunds, 2),
    'balance_due', round(v_due, 2),
    'orders', v_orders,
    'delivered', v_delivered,
    'fulfillment_avg', v_ful_avg,
    'fulfillment_median', v_ful_med,
    'new_clients', v_clients,
    'cwa_created', v_cwa,
    'cwa_converted', v_cwa_conv,
    'cwa_conversion', case when v_cwa > 0 then round(100.0 * v_cwa_conv / v_cwa, 1) else null end,
    'margin', case when v_role = 'admin' then round(v_cost_known - v_cost, 2) end,
    'margin_pct', case when v_role = 'admin' and v_cost_known > 0
                    then round(100.0 * (v_cost_known - v_cost) / v_cost_known, 1) end,
    'series', v_series
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Ventas: vendido vs cobrado y desgloses.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_sales(
  p_from date, p_to date, p_bucket text default 'dia'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.dash_guard(p_from, p_to, p_bucket);
  v_sold numeric;
  v_collected numeric;
  v_by_method jsonb;
  v_by_origin jsonb;
  v_by_type jsonb;
  v_by_service jsonb;
  v_by_material jsonb;
  v_margin jsonb;
  v_series jsonb;
begin
  select coalesce(sum(amount), 0) into v_sold from private.dash_sold(p_from, p_to);
  select coalesce(sum(amount), 0) into v_collected from private.dash_paid(p_from, p_to);

  select coalesce(jsonb_agg(jsonb_build_object(
           'd', b.b, 'vendido', coalesce(s.v, 0), 'cobrado', coalesce(c.v, 0)
         ) order by b.b), '[]'::jsonb)
    into v_series
  from private.dash_buckets(p_from, p_to, p_bucket) b
  left join (
    select private.dash_bucket_of(d, p_bucket) k, round(sum(amount), 2) v
    from private.dash_sold(p_from, p_to) group by 1
  ) s on s.k = b.b
  left join (
    select private.dash_bucket_of(d, p_bucket) k, round(sum(amount), 2) v
    from private.dash_paid(p_from, p_to) group by 1
  ) c on c.k = b.b;

  select coalesce(jsonb_agg(jsonb_build_object('label', method, 'value', v) order by v desc), '[]')
    into v_by_method
  from (select method, round(sum(amount), 2) v from private.dash_paid(p_from, p_to)
        group by method having sum(amount) <> 0) m;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', origin, 'sold', sold, 'orders', orders,
           'ticket', case when orders > 0 then round(sold / orders, 2) else 0 end
         ) order by sold desc), '[]')
    into v_by_origin
  from (select origin, round(sum(amount), 2) sold, count(distinct restoration_id) orders
        from private.dash_sold(p_from, p_to) group by origin) o;

  select coalesce(jsonb_agg(jsonb_build_object('key', payment_type, 'value', v) order by v desc), '[]')
    into v_by_type
  from (select payment_type, round(sum(amount), 2) v
        from private.dash_sold(p_from, p_to) group by payment_type) t;

  -- Con varios servicios (o materiales) en la pieza, el importe se reparte en partes iguales.
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', v) order by v desc), '[]')
    into v_by_service
  from (
    select coalesce(s.name, 'Sin servicio') label, round(sum(x.share), 2) v
    from (
      select u.id as sid, sold.amount / greatest(coalesce(cardinality(sold.service_ids), 0), 1) share
      from private.dash_sold(p_from, p_to) sold
      left join lateral unnest(
        case when coalesce(cardinality(sold.service_ids), 0) = 0 then array[null::uuid] else sold.service_ids end
      ) as u(id) on true
    ) x
    left join public.services s on s.id = x.sid
    group by 1 order by 2 desc limit 8
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', v) order by v desc), '[]')
    into v_by_material
  from (
    select coalesce(m.name, 'Sin material') label, round(sum(x.share), 2) v
    from (
      select u.id as mid, sold.amount / greatest(coalesce(cardinality(sold.material_ids), 0), 1) share
      from private.dash_sold(p_from, p_to) sold
      left join lateral unnest(
        case when coalesce(cardinality(sold.material_ids), 0) = 0 then array[null::uuid] else sold.material_ids end
      ) as u(id) on true
    ) x
    left join public.materials m on m.id = x.mid
    group by 1 order by 2 desc limit 8
  ) t;

  if v_role = 'admin' then
    select jsonb_build_object(
             'margin', round(coalesce(sum(amount - cost), 0), 2),
             'base', round(coalesce(sum(amount), 0), 2),
             'cost', round(coalesce(sum(cost), 0), 2),
             'pieces', count(*),
             'pieces_without_cost', (select count(*) from private.dash_sold(p_from, p_to) where cost is null)
           )
      into v_margin
    from private.dash_sold(p_from, p_to) where cost is not null;
  end if;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', p_bucket,
    'sold', round(v_sold, 2),
    'collected', round(v_collected, 2),
    'collection_rate', case when v_sold > 0 then round(100.0 * v_collected / v_sold, 1) end,
    'series', v_series,
    'by_method', v_by_method,
    'by_origin', v_by_origin,
    'by_payment_type', v_by_type,
    'by_service', v_by_service,
    'by_material', v_by_material,
    'margin', v_margin
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Pedidos: guías, piezas, embudo y cumplimiento.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_orders(
  p_from date, p_to date, p_bucket text default 'dia'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_by_status jsonb;
  v_by_kind jsonb;
  v_by_location jsonb;
  v_funnel jsonb;
  v_fulfillment jsonb;
  v_series jsonb;
  v_orders integer;
  v_pieces_per_order numeric;
begin
  perform private.dash_guard(p_from, p_to, p_bucket);
  select coalesce(jsonb_agg(jsonb_build_object('key', status, 'value', n) order by n desc), '[]')
    into v_by_status
  from (select status, count(*) n from public.restorations r
        where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end
        group by status) s;

  select coalesce(jsonb_agg(jsonb_build_object('key', kind, 'value', n) order by n desc), '[]')
    into v_by_kind
  from (select kind, count(*) n from public.restorations r
        where r.created_at >= v_start and r.created_at < v_end group by kind) k;

  select coalesce(jsonb_agg(jsonb_build_object('key', location, 'value', n)), '[]')
    into v_by_location
  from (select p.location, count(*) n from public.pieces p
        where p.location not in ('entregada', 'anulada') group by p.location) l;

  select count(*), round(avg(n), 1) into v_orders, v_pieces_per_order
  from (select r.id, (select count(*) from public.pieces p where p.restoration_id = r.id) n
        from public.restorations r
        where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end) t;

  -- Embudo de las piezas registradas en el rango (cohorte por fecha de registro).
  select jsonb_build_object(
           'registered', count(*),
           'approved', count(*) filter (where p.approved_at is not null),
           'delivered', count(*) filter (where p.status = 'entregada'),
           'in_consultation', count(*) filter (where p.status in ('en_consulta', 'en_espera')),
           'rejected', count(*) filter (where p.status = 'rechazada'),
           'no_fix', count(*) filter (where p.status = 'sin_arreglo'),
           'cancelled', count(*) filter (where p.status = 'anulada'),
           'urgent', count(*) filter (where p.urgent)
         )
    into v_funnel
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where r.kind = 'normal' and p.created_at >= v_start and p.created_at < v_end;

  select jsonb_build_object(
           'delivered', count(*),
           'avg', round(avg(days), 1),
           'median', round((percentile_cont(0.5) within group (order by days))::numeric, 1),
           'p90', round((percentile_cont(0.9) within group (order by days))::numeric, 1),
           'buckets', jsonb_build_array(
             jsonb_build_object('label', '0–3 días', 'value', count(*) filter (where days <= 3)),
             jsonb_build_object('label', '4–7 días', 'value', count(*) filter (where days between 4 and 7)),
             jsonb_build_object('label', '8–15 días', 'value', count(*) filter (where days between 8 and 15)),
             jsonb_build_object('label', '16 o más', 'value', count(*) filter (where days >= 16))
           )
         )
    into v_fulfillment
  from (
    select public.lima_days_between(p.created_at, p.delivered_at) days
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where r.kind = 'normal' and p.status = 'entregada'
      and p.delivered_at >= v_start and p.delivered_at < v_end
  ) f;

  select coalesce(jsonb_agg(jsonb_build_object(
           'd', b.b, 'guias', coalesce(o.v, 0), 'entregadas', coalesce(e.v, 0)
         ) order by b.b), '[]'::jsonb)
    into v_series
  from private.dash_buckets(p_from, p_to, p_bucket) b
  left join (
    select private.dash_bucket_of((r.created_at at time zone 'America/Lima')::date, p_bucket) k,
           count(*) v
    from public.restorations r
    where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end group by 1
  ) o on o.k = b.b
  left join (
    select private.dash_bucket_of((p.delivered_at at time zone 'America/Lima')::date, p_bucket) k,
           count(*) v
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where r.kind = 'normal' and p.status = 'entregada'
      and p.delivered_at >= v_start and p.delivered_at < v_end group by 1
  ) e on e.k = b.b;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', p_bucket,
    'orders', v_orders,
    'pieces_per_order', v_pieces_per_order,
    'by_status', v_by_status,
    'by_kind', v_by_kind,
    'by_location', v_by_location,
    'funnel', v_funnel,
    'fulfillment', v_fulfillment,
    'series', v_series
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Clientes: altas, recompra, mejores clientes, regiones y deudas.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_clients(
  p_from date, p_to date, p_bucket text default 'dia'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_total integer;
  v_new integer;
  v_active integer;
  v_returning integer;
  v_by_kind jsonb;
  v_top jsonb;
  v_regions jsonb;
  v_debtors jsonb;
  v_series jsonb;
begin
  perform private.dash_guard(p_from, p_to, p_bucket);
  select count(*) into v_total from public.clients where active;
  select count(*) into v_new from public.clients c
  where c.created_at >= v_start and c.created_at < v_end;

  -- Clientes con guías Normales registradas en el rango; "recurrentes" ya tenían una antes.
  select count(*),
         count(*) filter (where exists (
           select 1 from public.restorations o
           where o.client_id = a.client_id and o.kind = 'normal' and o.created_at < v_start))
    into v_active, v_returning
  from (select distinct r.client_id from public.restorations r
        where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end) a;

  select coalesce(jsonb_agg(jsonb_build_object('key', kind, 'value', n) order by n desc), '[]')
    into v_by_kind
  from (select c.kind, count(*) n from public.clients c
        where c.created_at >= v_start and c.created_at < v_end group by c.kind) k;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'orders', orders, 'sold', sold,
           'pieces', pieces, 'last_at', last_at
         ) order by sold desc), '[]')
    into v_top
  from (
    select c.id, c.display_name as name,
           count(distinct s.restoration_id) orders, count(*) pieces,
           round(sum(s.amount), 2) sold, max(s.d) last_at
    from private.dash_sold(p_from, p_to) s
    join public.clients c on c.id = s.client_id
    group by c.id, c.display_name order by sum(s.amount) desc limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'region', region, 'orders', orders, 'sold', sold, 'clients', clients
         ) order by sold desc), '[]')
    into v_regions
  from (
    select coalesce(nullif(c.region, ''), 'SIN') region,
           count(distinct s.restoration_id) orders, count(distinct c.id) clients,
           round(sum(s.amount), 2) sold
    from private.dash_sold(p_from, p_to) s
    join public.clients c on c.id = s.client_id
    group by 1 order by sum(s.amount) desc limit 8
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'orders', orders, 'due', due
         ) order by due desc), '[]')
    into v_debtors
  from (
    select c.id, c.display_name as name, count(*) orders, round(sum(d.due), 2) due
    from private.dash_due() d
    join public.clients c on c.id = d.client_id
    where d.due > 0
    group by c.id, c.display_name order by sum(d.due) desc limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'd', b.b, 'nuevos', coalesce(n.v, 0)
         ) order by b.b), '[]'::jsonb)
    into v_series
  from private.dash_buckets(p_from, p_to, p_bucket) b
  left join (
    select private.dash_bucket_of((c.created_at at time zone 'America/Lima')::date, p_bucket) k,
           count(*) v
    from public.clients c where c.created_at >= v_start and c.created_at < v_end group by 1
  ) n on n.k = b.b;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', p_bucket,
    'total_active', v_total,
    'new_clients', v_new,
    'active_in_range', v_active,
    'returning', v_returning,
    'repeat_rate', case when v_active > 0 then round(100.0 * v_returning / v_active, 1) end,
    'new_by_kind', v_by_kind,
    'top_clients', v_top,
    'regions', v_regions,
    'top_debtors', v_debtors,
    'series', v_series
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Talleres: días en taller (promedio y mediana), carga actual y costo.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_workshops(
  p_from date, p_to date, p_alert_days integer default 7
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.dash_guard(p_from, p_to);
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_rows jsonb;
  v_total jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.avg_days desc nulls last), '[]')
    into v_rows
  from (
    select w.id, w.name, w.active,
           coalesce(rt.returned, 0) as returned,
           rt.avg_days, rt.median_days, rt.max_days,
           coalesce(se.sent, 0) as sent,
           coalesce(ob.observed, 0) as observed,
           coalesce(nw.now_count, 0) as in_workshop,
           coalesce(nw.over_alert, 0) as over_alert,
           nw.max_now_days,
           case when v_role = 'admin' then rt.cost end as cost,
           case when v_role = 'admin' then rt.avg_cost end as avg_cost
    from public.workshops w
    left join (
      select workshop_id, count(*) returned,
             round(avg(days), 1) avg_days,
             round((percentile_cont(0.5) within group (order by days))::numeric, 1) median_days,
             max(days) max_days,
             round(sum(cost), 2) cost, round(avg(cost), 2) avg_cost
      from private.dash_workshop_returns(p_from, p_to) group by workshop_id
    ) rt on rt.workshop_id = w.id
    left join (
      select coalesce(h.workshop_id, p.workshop_id) workshop_id, count(*) sent
      from public.piece_status_history h
      join public.pieces p on p.id = h.piece_id
      where h.event = 'envio_taller' and h.occurred_at >= v_start and h.occurred_at < v_end
      group by 1
    ) se on se.workshop_id = w.id
    left join (
      select p.workshop_id, count(distinct h.piece_id) observed
      from public.piece_status_history h
      join public.pieces p on p.id = h.piece_id
      where h.to_status = 'observada' and h.occurred_at >= v_start and h.occurred_at < v_end
      group by 1
    ) ob on ob.workshop_id = w.id
    left join (
      select p.workshop_id, count(*) now_count,
             count(*) filter (where public.lima_days_between(p.last_sent_at, now()) >= p_alert_days) over_alert,
             max(public.lima_days_between(p.last_sent_at, now())) max_now_days
      from public.pieces p
      where private.piece_in_workshop(p.status, p.last_sent_at, p.last_returned_at, p.observed_at)
      group by 1
    ) nw on nw.workshop_id = w.id
    where w.active or rt.returned > 0 or se.sent > 0 or nw.now_count > 0
  ) t;

  select jsonb_build_object(
           'returned', count(*),
           'avg_days', round(avg(days), 1),
           'median_days', round((percentile_cont(0.5) within group (order by days))::numeric, 1),
           'in_workshop', (select count(*) from public.pieces p
                           where private.piece_in_workshop(p.status, p.last_sent_at, p.last_returned_at, p.observed_at)),
           'over_alert', (select count(*) from public.pieces p
                          where private.piece_in_workshop(p.status, p.last_sent_at, p.last_returned_at, p.observed_at)
                            and public.lima_days_between(p.last_sent_at, now()) >= p_alert_days),
           'cost', case when v_role = 'admin' then round(sum(cost), 2) end,
           'buckets', jsonb_build_array(
             jsonb_build_object('label', '0–3 días', 'value', count(*) filter (where days <= 3)),
             jsonb_build_object('label', '4–7 días', 'value', count(*) filter (where days between 4 and 7)),
             jsonb_build_object('label', '8–14 días', 'value', count(*) filter (where days between 8 and 14)),
             jsonb_build_object('label', '15 o más', 'value', count(*) filter (where days >= 15))
           )
         )
    into v_total
  from private.dash_workshop_returns(p_from, p_to);

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'alert_days', p_alert_days,
    'workshops', v_rows, 'total', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Vendedores: el admin ve a todos; ventas solo su propia fila.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_sellers(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.dash_guard(p_from, p_to);
  v_me uuid := (select auth.uid());
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sold desc, t.orders desc), '[]')
    into v_rows
  from (
    select k.seller as id,
           coalesce(pr.full_name, 'Sin vendedor') as name,
           (k.seller is not distinct from v_me) as is_self,
           coalesce(o.orders, 0) as orders,
           coalesce(s.sold, 0) as sold,
           coalesce(s.sold_orders, 0) as sold_orders,
           case when coalesce(s.sold_orders, 0) > 0 then round(s.sold / s.sold_orders, 2) else 0 end as ticket,
           coalesce(c.collected, 0) as collected,
           coalesce(pc.pieces, 0) as pieces,
           coalesce(pc.approved, 0) as approved,
           case when coalesce(pc.pieces, 0) > 0 then round(100.0 * pc.approved / pc.pieces, 1) end as approval_rate,
           coalesce(q.cwa, 0) as cwa_created,
           coalesce(q.converted, 0) as cwa_converted
    from (
      select r.created_by seller from public.restorations r
        where r.created_at >= v_start and r.created_at < v_end
      union select seller from private.dash_sold(p_from, p_to)
      union select seller from private.dash_paid(p_from, p_to)
      union select wq.created_by from public.whatsapp_quotes wq
        where wq.created_at >= v_start and wq.created_at < v_end
    ) k
    left join public.profiles pr on pr.id = k.seller
    left join (
      select r.created_by seller, count(*) orders from public.restorations r
      where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end group by 1
    ) o on o.seller is not distinct from k.seller
    left join (
      select seller, round(sum(amount), 2) sold, count(distinct restoration_id) sold_orders
      from private.dash_sold(p_from, p_to) group by seller
    ) s on s.seller is not distinct from k.seller
    left join (
      select seller, round(sum(amount), 2) collected from private.dash_paid(p_from, p_to) group by seller
    ) c on c.seller is not distinct from k.seller
    left join (
      select r.created_by seller, count(*) pieces, count(*) filter (where p.approved_at is not null) approved
      from public.pieces p join public.restorations r on r.id = p.restoration_id
      where r.kind = 'normal' and p.created_at >= v_start and p.created_at < v_end group by 1
    ) pc on pc.seller is not distinct from k.seller
    left join (
      select wq.created_by seller, count(*) cwa,
             count(*) filter (where wq.status in ('pedida', 'pedida_parcial')) converted
      from public.whatsapp_quotes wq
      where wq.created_at >= v_start and wq.created_at < v_end group by 1
    ) q on q.seller is not distinct from k.seller
    where v_role = 'admin' or k.seller = v_me
  ) t;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'scope', case when v_role = 'admin' then 'todos' else 'propio' end,
    'sellers', v_rows
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Cotizaciones: embudo de WhatsApp (P46), cotizador COT y oficina vs WhatsApp.
-- ---------------------------------------------------------------------------------------
create or replace function public.dashboard_quotes(
  p_from date, p_to date, p_bucket text default 'dia'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_cwa jsonb;
  v_reasons jsonb;
  v_cot jsonb;
  v_origin jsonb;
  v_series jsonb;
begin
  perform private.dash_guard(p_from, p_to, p_bucket);
  select jsonb_build_object(
           'created', count(*),
           'cotizada', count(*) filter (where q.status = 'cotizada'),
           'pedida_parcial', count(*) filter (where q.status = 'pedida_parcial'),
           'pedida', count(*) filter (where q.status = 'pedida'),
           'descartada', count(*) filter (where q.status = 'descartada'),
           'quoted_amount', round(coalesce(sum(q.total), 0), 2),
           'items_quoted', coalesce(sum(it.n), 0),
           'items_ordered', coalesce(sum(it.ordered), 0),
           'ordered_amount', round(coalesce(sum(it.ordered_amount), 0), 2),
           'conversion', case when count(*) > 0
              then round(100.0 * count(*) filter (where q.status in ('pedida', 'pedida_parcial')) / count(*), 1) end,
           'item_conversion', case when coalesce(sum(it.n), 0) > 0
              then round(100.0 * coalesce(sum(it.ordered), 0) / sum(it.n), 1) end
         )
    into v_cwa
  from public.whatsapp_quotes q
  left join lateral (
    select count(*) n,
           count(*) filter (where lp.id is not null) ordered,
           sum(private.piece_amount(i.price, i.quantity)) filter (where lp.id is not null) ordered_amount
    from public.whatsapp_quote_items i
    left join lateral (
      select p.id from public.pieces p
      where p.whatsapp_quote_item_id = i.id
        and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
      limit 1
    ) lp on true
    where i.quote_id = q.id
  ) it on true
  where q.created_at >= v_start and q.created_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object('label', reason, 'value', n) order by n desc), '[]')
    into v_reasons
  from (
    select left(lower(btrim(coalesce(nullif(btrim(q.discard_reason), ''), 'Sin motivo'))), 80) reason,
           count(*) n
    from public.whatsapp_quotes q
    where q.status = 'descartada' and q.discarded_at >= v_start and q.discarded_at < v_end
    group by 1 order by 2 desc limit 6
  ) r;

  select jsonb_build_object(
           'created', count(*),
           'borrador', count(*) filter (where public.effective_status(q) = 'borrador'),
           'emitida', count(*) filter (where public.effective_status(q) = 'emitida'),
           'aceptada', count(*) filter (where public.effective_status(q) = 'aceptada'),
           'rechazada', count(*) filter (where public.effective_status(q) = 'rechazada'),
           'vencida', count(*) filter (where public.effective_status(q) = 'vencida'),
           'amount', round(coalesce(sum(q.total) filter (where q.status <> 'borrador'), 0), 2),
           'accepted_amount', round(coalesce(sum(q.total) filter (where q.status = 'aceptada'), 0), 2),
           'acceptance', case when count(*) filter (where q.status <> 'borrador') > 0
              then round(100.0 * count(*) filter (where q.status = 'aceptada')
                         / count(*) filter (where q.status <> 'borrador'), 1) end
         )
    into v_cot
  from public.quotes q
  where q.created_at >= v_start and q.created_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', o.origin, 'orders', coalesce(g.orders, 0), 'sold', coalesce(s.sold, 0),
           'ticket', case when coalesce(s.sold_orders, 0) > 0 then round(s.sold / s.sold_orders, 2) else 0 end
         ) order by o.origin), '[]')
    into v_origin
  from unnest(enum_range(null::public.restoration_origin)) as o(origin)
  left join (
    select r.origin, count(*) orders from public.restorations r
    where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end group by 1
  ) g on g.origin = o.origin
  left join (
    select origin, round(sum(amount), 2) sold, count(distinct restoration_id) sold_orders
    from private.dash_sold(p_from, p_to) group by origin
  ) s on s.origin = o.origin;

  select coalesce(jsonb_agg(jsonb_build_object(
           'd', b.b, 'cotizadas', coalesce(c.created, 0), 'pedidas', coalesce(c.converted, 0)
         ) order by b.b), '[]'::jsonb)
    into v_series
  from private.dash_buckets(p_from, p_to, p_bucket) b
  left join (
    select private.dash_bucket_of((q.created_at at time zone 'America/Lima')::date, p_bucket) k,
           count(*) created,
           count(*) filter (where q.status in ('pedida', 'pedida_parcial')) converted
    from public.whatsapp_quotes q
    where q.created_at >= v_start and q.created_at < v_end group by 1
  ) c on c.k = b.b;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', p_bucket,
    'cwa', v_cwa, 'discard_reasons', v_reasons, 'cot', v_cot,
    'by_origin', v_origin, 'series', v_series
  );
end;
$$;

revoke execute on function
  public.dashboard_summary(date, date, text),
  public.dashboard_sales(date, date, text),
  public.dashboard_orders(date, date, text),
  public.dashboard_clients(date, date, text),
  public.dashboard_workshops(date, date, integer),
  public.dashboard_sellers(date, date),
  public.dashboard_quotes(date, date, text)
  from public, anon;
grant execute on function
  public.dashboard_summary(date, date, text),
  public.dashboard_sales(date, date, text),
  public.dashboard_orders(date, date, text),
  public.dashboard_clients(date, date, text),
  public.dashboard_workshops(date, date, integer),
  public.dashboard_sellers(date, date),
  public.dashboard_quotes(date, date, text)
  to authenticated;
