-- Cotizaciones (`COT-`, pedido del 2026-11-05): flujo Aceptada → Facturada → Reembolsada.
--   * Facturada solo viene de Aceptada; Reembolsada solo viene de Facturada y es final.
--     Una aceptada puede seguir yendo a Emitida o Anulada, como antes.
--   * Conservan las fechas de entrega (Facturada las puede editar; Reembolsada ya no).
--   * Dashboard: ambas cuentan como aceptadas (monto aceptado y tasa de aceptación) y
--     tienen su propio contador.

create or replace function private.quote_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := private.lima_today();
begin
  if old.status <> 'borrador' and (
    (new.client_id is distinct from old.client_id and not private.merging_clients())
    or new.contact_id is distinct from old.contact_id
    or new.validity_days is distinct from old.validity_days
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.payment_condition is distinct from old.payment_condition
    or new.delivery_days is distinct from old.delivery_days
    or new.credit_days is distinct from old.credit_days
    or new.apply_igv is distinct from old.apply_igv
  ) then
    raise exception 'Solo se puede editar una cotización en borrador'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'borrador' and new.status = 'emitida')
      or (old.status = 'emitida' and new.status in ('aceptada', 'rechazada'))
      or (old.status in ('aceptada', 'rechazada') and new.status = 'emitida')
      or (old.status in ('emitida', 'aceptada', 'rechazada') and new.status = 'anulada')
      or (old.status = 'aceptada' and new.status = 'facturada')
      or (old.status = 'facturada' and new.status = 'reembolsada')
    ) then
      raise exception 'No se puede pasar una cotización de % a %', old.status, new.status
        using errcode = '23514';
    end if;
    if old.status = 'borrador' then
      if not exists (select 1 from public.quote_items where quote_id = new.id) then
        raise exception 'La cotización necesita al menos una línea para emitirse'
          using errcode = '23514';
      end if;
      new.issue_date := private.lima_today();
      new.issued_at := now();
    end if;
  end if;

  -- Una reembolsada ya no cambia sus fechas de entrega.
  if old.status = 'reembolsada' and (
    new.delivery_date is distinct from old.delivery_date
    or new.supplier_delivery_date is distinct from old.supplier_delivery_date
  ) then
    raise exception 'Una cotización reembolsada no cambia sus fechas de entrega'
      using errcode = '23514';
  end if;

  -- Fechas de entrega: solo en las aceptadas, facturadas y reembolsadas.
  if new.status not in ('aceptada', 'facturada', 'reembolsada') then
    new.delivery_date := null;
    new.supplier_delivery_date := null;
    return new;
  end if;

  -- Obligatoria al aceptarla (o si se intenta borrar); las aceptadas de antes pueden
  -- seguir sin fecha hasta que se les coloque.
  if new.delivery_date is null
     and (old.status not in ('aceptada', 'facturada', 'reembolsada')
          or old.delivery_date is not null) then
    raise exception 'Indica la fecha de entrega.' using errcode = '23514';
  end if;

  if new.delivery_date is not null
     and new.delivery_date is distinct from old.delivery_date
     and new.delivery_date < v_today then
    raise exception 'La fecha de entrega no puede ser anterior a hoy.' using errcode = '23514';
  end if;

  -- Fecha del proveedor por defecto: 3 días antes de la de entrega, sin pasar de hoy.
  if new.delivery_date is not null and new.supplier_delivery_date is null then
    new.supplier_delivery_date := greatest(new.delivery_date - 3, v_today);
  end if;

  -- La fecha de entrega se adelantó por delante de la del proveedor (que no se tocó):
  -- se recalcula en vez de fallar.
  if new.delivery_date is distinct from old.delivery_date
     and new.supplier_delivery_date is not distinct from old.supplier_delivery_date
     and new.supplier_delivery_date > new.delivery_date then
    new.supplier_delivery_date := greatest(new.delivery_date - 3, v_today);
  end if;

  if new.supplier_delivery_date is not null
     and new.supplier_delivery_date is distinct from old.supplier_delivery_date
     and new.supplier_delivery_date < v_today then
    raise exception 'La fecha de entrega del proveedor no puede ser anterior a hoy.'
      using errcode = '23514';
  end if;

  if new.supplier_delivery_date > new.delivery_date then
    raise exception 'La fecha del proveedor no puede ser posterior a la de entrega.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

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
           'facturada', count(*) filter (where q.status = 'facturada'),
           'reembolsada', count(*) filter (where q.status = 'reembolsada'),
           'rechazada', count(*) filter (where public.effective_status(q) = 'rechazada'),
           'vencida', count(*) filter (where public.effective_status(q) = 'vencida'),
           'anulada', count(*) filter (where q.status = 'anulada'),
           'amount', round(coalesce(sum(q.total) filter (where q.status not in ('borrador', 'anulada')), 0), 2),
           'accepted_amount', round(coalesce(sum(q.total) filter (where q.status in ('aceptada', 'facturada', 'reembolsada')), 0), 2),
           'acceptance', case when count(*) filter (where q.status not in ('borrador', 'anulada')) > 0
              then round(100.0 * count(*) filter (where q.status in ('aceptada', 'facturada', 'reembolsada'))
                         / count(*) filter (where q.status not in ('borrador', 'anulada')), 1) end
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
