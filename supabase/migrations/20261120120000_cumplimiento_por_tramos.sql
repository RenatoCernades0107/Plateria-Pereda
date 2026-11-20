-- Divide el tiempo de cumplimiento en dos tramos: registro → aprobación (piezas
-- aprobadas en el rango) y aprobación → entrega (piezas entregadas en el rango).
-- El KPI de cumplimiento (registro → entrega) se mantiene, sin sus tramos.

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
  v_approval_time jsonb;
  v_delivery_time jsonb;
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

  -- Registro → entrega (KPI de cumplimiento): piezas entregadas en el rango.
  select jsonb_build_object(
           'delivered', count(*),
           'avg', round(avg(days), 1),
           'median', round((percentile_cont(0.5) within group (order by days))::numeric, 1),
           'p90', round((percentile_cont(0.9) within group (order by days))::numeric, 1)
         )
    into v_fulfillment
  from (
    select public.lima_days_between(p.created_at, p.delivered_at) days
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where r.kind = 'normal' and p.status = 'entregada'
      and p.delivered_at >= v_start and p.delivered_at < v_end
  ) f;

  -- Registro → aprobación: piezas aprobadas en el rango (por fecha de aprobación).
  select jsonb_build_object(
           'count', count(*),
           'avg', round(avg(days), 1),
           'median', round((percentile_cont(0.5) within group (order by days))::numeric, 1),
           'buckets', jsonb_build_array(
             jsonb_build_object('label', '0–1 días', 'value', count(*) filter (where days <= 1)),
             jsonb_build_object('label', '2–3 días', 'value', count(*) filter (where days between 2 and 3)),
             jsonb_build_object('label', '4–7 días', 'value', count(*) filter (where days between 4 and 7)),
             jsonb_build_object('label', '8 o más', 'value', count(*) filter (where days >= 8))
           )
         )
    into v_approval_time
  from (
    select public.lima_days_between(p.created_at, p.approved_at) days
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where r.kind = 'normal'
      and p.approved_at >= v_start and p.approved_at < v_end
  ) a;

  -- Aprobación → entrega: piezas aprobadas que se entregaron en el rango.
  select jsonb_build_object(
           'count', count(*),
           'avg', round(avg(days), 1),
           'median', round((percentile_cont(0.5) within group (order by days))::numeric, 1),
           'buckets', jsonb_build_array(
             jsonb_build_object('label', '0–3 días', 'value', count(*) filter (where days <= 3)),
             jsonb_build_object('label', '4–7 días', 'value', count(*) filter (where days between 4 and 7)),
             jsonb_build_object('label', '8–15 días', 'value', count(*) filter (where days between 8 and 15)),
             jsonb_build_object('label', '16 o más', 'value', count(*) filter (where days >= 16))
           )
         )
    into v_delivery_time
  from (
    select public.lima_days_between(p.approved_at, p.delivered_at) days
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where r.kind = 'normal' and p.status = 'entregada' and p.approved_at is not null
      and p.delivered_at >= v_start and p.delivered_at < v_end
  ) d;

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
    'approval_time', v_approval_time,
    'delivery_time', v_delivery_time,
    'series', v_series
  );
end;
$$;

revoke execute on function public.dashboard_orders(date, date, text) from public, anon;
grant execute on function public.dashboard_orders(date, date, text) to authenticated;
