-- Pagos hechos en Shopify y cambio de cliente de la orden (Paso 11.3, P43 punto 5,
-- P12 (2), D31).
--   * Los webhooks de la orden (orders/paid, orders/updated, order_transactions/create,
--     refunds/create) solo encolan `payment.sync` de la restauración: el job consulta
--     a Shopify las transacciones actuales (inmune a webhooks duplicados o
--     desordenados) y agrega al registro las que no vienen del sistema.
--   * `shopify_order_transactions` guarda las transacciones ya contadas: las que creó
--     el sistema (al crear la orden, el pago completo o un reembolso) y las importadas.
--   * Dos procesadores no trabajan a la vez la misma restauración (claim por entidad),
--     así una transacción del sistema no se confunde con una hecha en el POS.
--   * Si en Shopify cambian el cliente de la orden (persona), la restauración pasa al
--     cliente local con ese id de Shopify (se crea si no existe).

create table public.shopify_order_transactions (
  id text primary key,
  restoration_id uuid not null references public.restorations (id) on delete cascade,
  origin public.payment_source not null,
  created_at timestamptz not null default now()
);

comment on table public.shopify_order_transactions is
  'Transacciones de la orden de Shopify ya contadas en el registro de pagos (del sistema o importadas).';

create index shopify_order_transactions_restoration_idx
  on public.shopify_order_transactions (restoration_id);

alter table public.shopify_order_transactions enable row level security;
revoke all on public.shopify_order_transactions from anon, authenticated;

-- Encola la conciliación desde un webhook (solo la clave secreta).
create or replace function public.enqueue_payment_sync(p_restoration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_order_job('payment.sync', p_restoration_id);
end;
$$;

revoke execute on function public.enqueue_payment_sync(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_payment_sync(uuid) to service_role;

-- Cambio de cliente hecho en Shopify (D31): solo restauraciones de personas. Devuelve
-- true si cambió. El cliente local se busca o crea con import_shopify_customer.
create or replace function public.apply_shopify_order_customer(
  p_restoration_id uuid,
  p_customer_id text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.clients;
  v_client uuid;
begin
  select c.* into v_current
  from public.restorations r join public.clients c on c.id = r.client_id
  where r.id = p_restoration_id;
  if v_current.id is null or v_current.kind <> 'persona'
     or v_current.shopify_customer_id is not distinct from p_customer_id then
    return false;
  end if;
  -- Un contacto de empresa no pasa a ser el cliente de la restauración.
  if exists (select 1 from public.contacts where shopify_customer_id = p_customer_id) then
    return false;
  end if;

  perform public.import_shopify_customer(
    p_customer_id, p_first_name, p_last_name, p_email, p_phone,
    'Creado al cambiar el cliente de una orden en Shopify.', null
  );
  select id into v_client from public.clients
  where shopify_customer_id = p_customer_id and kind = 'persona';
  if v_client is null then
    return false;
  end if;

  perform set_config('app.sync_origin', 'shopify', true);
  update public.restorations set client_id = v_client, contact_id = null
  where id = p_restoration_id;
  perform set_config('app.sync_origin', '', true);
  return true;
end;
$$;

revoke execute on function public.apply_shopify_order_customer(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_shopify_order_customer(uuid, text, text, text, text, text)
  to service_role;

-- Un procesador a la vez por entidad: no se toman jobs de una entidad que otro
-- procesador tiene en curso. Dentro de un lote sí van varios de la misma entidad,
-- porque el lote se procesa en orden.
create or replace function public.claim_shopify_jobs(
  p_limit integer default 10,
  p_lock_timeout interval default interval '5 minutes'
)
returns setof public.shopify_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Dos procesadores no eligen a la vez (si no, ambos verían la entidad libre).
  perform pg_advisory_xact_lock(hashtext('public.claim_shopify_jobs'));
  return query
  update public.shopify_sync_jobs as j
  set status = 'processing', locked_at = now(), attempts = j.attempts + 1
  where j.id in (
    select s.id from public.shopify_sync_jobs s
    where ((s.status = 'pending' and s.next_attempt_at <= now())
        or (s.status = 'processing' and s.locked_at < now() - p_lock_timeout))
      and not exists (
        select 1 from public.shopify_sync_jobs p
        where p.status = 'processing' and p.locked_at >= now() - p_lock_timeout
          and p.entity_table = s.entity_table and p.entity_id = s.entity_id
          and p.id <> s.id
      )
    order by s.next_attempt_at, s.id
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;

revoke execute on function public.claim_shopify_jobs(integer, interval)
  from public, anon, authenticated;
grant execute on function public.claim_shopify_jobs(integer, interval) to service_role;
