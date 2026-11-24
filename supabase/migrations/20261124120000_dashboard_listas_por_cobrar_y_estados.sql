-- Dashboard: listas por cobrar, aprobadas vs. antes de aprobar y cantidades por desglose.
--
-- Cambios sobre las funciones de `20261028130000_dashboard_metricas.sql`:
--   · dashboard_summary: fotos de hoy de las guías y las piezas normales, separadas en
--       «antes de aprobar» y «aprobadas»:
--         guides_before_approval = guías registradas (sin aprobar ninguna pieza);
--         guides_approved        = parcialmente_aprobada, aprobada, en_proceso,
--                                  parcialmente_lista y lista (sin completada, anulada
--                                  ni rechazada);
--         pieces_before_approval = registrada + en_consulta + en_espera;
--         pieces_approved        = aprobada + observada (las entregadas ya tienen su KPI).
--   · dashboard_sales:
--       - `ready_to_collect` (foto de hoy): piezas listas para entregar y guías en estado
--         lista o parcialmente_lista cuyo pago sigue pendiente o parcial (saldo > 0), con
--         el saldo de esas guías. Solo guías Normales.
--       - se quita `by_payment_type` («Vendido según tipo de pago»).
--       - `by_method`, `by_service` y `by_material` suman `count`: nº de pagos (sin los
--         reembolsos) y nº de piezas con ese servicio o material (sin repartir).
--   · dashboard_orders: el embudo separa `in_consultation` (solo en_consulta) de
--       `waiting_client` (en_espera, «Espera respuesta cliente»).

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
  v_guides_before integer;
  v_guides_approved integer;
  v_pieces_before integer;
  v_pieces_approved integer;
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

  -- Fotos de hoy (no dependen del rango): guías y piezas Normales antes y después de aprobar.
  select count(*) filter (where r.status = 'registrada'),
         count(*) filter (where r.status in (
           'parcialmente_aprobada', 'aprobada', 'en_proceso', 'parcialmente_lista', 'lista'))
    into v_guides_before, v_guides_approved
  from public.restorations r
  where r.kind = 'normal';

  select count(*) filter (where p.status in ('registrada', 'en_consulta', 'en_espera')),
         count(*) filter (where p.status in ('aprobada', 'observada'))
    into v_pieces_before, v_pieces_approved
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where r.kind = 'normal';

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
    'guides_before_approval', v_guides_before,
    'guides_approved', v_guides_approved,
    'pieces_before_approval', v_pieces_before,
    'pieces_approved', v_pieces_approved,
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
  v_by_service jsonb;
  v_by_material jsonb;
  v_margin jsonb;
  v_ready jsonb;
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

  -- `count` = pagos recibidos con ese método (los reembolsos restan del monto, no de la cantidad).
  select coalesce(jsonb_agg(jsonb_build_object('label', method, 'value', v, 'count', n) order by v desc), '[]')
    into v_by_method
  from (select method, round(sum(amount), 2) v, count(*) filter (where amount > 0) n
        from private.dash_paid(p_from, p_to)
        group by method having sum(amount) <> 0) m;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', origin, 'sold', sold, 'orders', orders,
           'ticket', case when orders > 0 then round(sold / orders, 2) else 0 end
         ) order by sold desc), '[]')
    into v_by_origin
  from (select origin, round(sum(amount), 2) sold, count(distinct restoration_id) orders
        from private.dash_sold(p_from, p_to) group by origin) o;

  -- Con varios servicios (o materiales) en la pieza, el importe se reparte en partes iguales;
  -- `count` son las piezas que llevan ese servicio (material), sin repartir.
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', v, 'count', n) order by v desc), '[]')
    into v_by_service
  from (
    select coalesce(s.name, 'Sin servicio') label, round(sum(x.share), 2) v,
           count(distinct x.piece_id) n
    from (
      select u.id as sid, sold.piece_id,
             sold.amount / greatest(coalesce(cardinality(sold.service_ids), 0), 1) share
      from private.dash_sold(p_from, p_to) sold
      left join lateral unnest(
        case when coalesce(cardinality(sold.service_ids), 0) = 0 then array[null::uuid] else sold.service_ids end
      ) as u(id) on true
    ) x
    left join public.services s on s.id = x.sid
    group by 1 order by 2 desc limit 8
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', v, 'count', n) order by v desc), '[]')
    into v_by_material
  from (
    select coalesce(m.name, 'Sin material') label, round(sum(x.share), 2) v,
           count(distinct x.piece_id) n
    from (
      select u.id as mid, sold.piece_id,
             sold.amount / greatest(coalesce(cardinality(sold.material_ids), 0), 1) share
      from private.dash_sold(p_from, p_to) sold
      left join lateral unnest(
        case when coalesce(cardinality(sold.material_ids), 0) = 0 then array[null::uuid] else sold.material_ids end
      ) as u(id) on true
    ) x
    left join public.materials m on m.id = x.mid
    group by 1 order by 2 desc limit 8
  ) t;

  -- Listas por cobrar (foto de hoy): lo que ya se puede entregar pero no está pagado.
  --   · piezas: listas para entregar de guías Normales con pago pendiente o parcial;
  --   · guías: en estado lista o parcialmente_lista con el mismo pago, y su saldo.
  select jsonb_build_object(
           'pieces', (
             select count(*)
             from public.pieces p
             join public.restorations r on r.id = p.restoration_id
             where r.kind = 'normal'
               and r.payment_status in ('pendiente', 'parcial')
               and r.balance > 0
               and p.ready_for_delivery
           ),
           'guides', count(*),
           'guides_balance', round(coalesce(sum(r.balance), 0), 2)
         )
    into v_ready
  from public.restorations r
  where r.kind = 'normal'
    and r.status in ('lista', 'parcialmente_lista')
    and r.payment_status in ('pendiente', 'parcial')
    and r.balance > 0;

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
    'by_service', v_by_service,
    'by_material', v_by_material,
    'ready_to_collect', v_ready,
    'margin', v_margin
  );
end;
$$;

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
           'in_consultation', count(*) filter (where p.status = 'en_consulta'),
           'waiting_client', count(*) filter (where p.status = 'en_espera'),
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
