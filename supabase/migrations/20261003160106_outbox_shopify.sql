-- Outbox de escrituras hacia Shopify (D05): cada cambio que debe llegar a Shopify se
-- guarda como un job en la misma transacción que el cambio. Un procesador lo envía y
-- reintenta con espera creciente si Shopify falla, así no se pierden clientes, órdenes
-- ni pagos por errores de red.

create table public.shopify_sync_jobs (
  id bigint generated always as identity primary key,
  -- Qué hacer, p. ej. 'customer.create' o 'order.create'.
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  -- Registro del sistema al que corresponde (para mostrar su estado de sincronización).
  entity_table text not null,
  entity_id text not null,
  payload jsonb not null default '{}',
  -- Evita encolar dos veces la misma operación pendiente.
  idempotency_key text,
  -- pending: por enviar o esperando reintento; processing: tomado por un procesador;
  -- ok: enviado; error: falló sin más reintentos (requiere "Reintentar").
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ok', 'error')),
  attempts integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  result jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.shopify_sync_jobs is
  'Outbox de escrituras hacia Shopify. Solo admin lo lee; lo procesa el servidor.';

create index shopify_sync_jobs_due_idx on public.shopify_sync_jobs (next_attempt_at)
  where status in ('pending', 'processing');
create index shopify_sync_jobs_entity_idx
  on public.shopify_sync_jobs (entity_table, entity_id, created_at desc);
create unique index shopify_sync_jobs_idempotency_key
  on public.shopify_sync_jobs (idempotency_key)
  where idempotency_key is not null and status in ('pending', 'processing');

create trigger shopify_sync_jobs_set_updated_at
  before update on public.shopify_sync_jobs
  for each row execute function private.set_updated_at();

revoke all on public.shopify_sync_jobs from anon, authenticated;
grant select on public.shopify_sync_jobs to authenticated;

alter table public.shopify_sync_jobs enable row level security;

create policy "Solo admin lee el outbox de Shopify"
  on public.shopify_sync_jobs for select to authenticated
  using ((select private.has_role('{admin}')));

-- Encola un job; si ya hay uno pendiente con la misma clave, devuelve ese.
-- La usan los triggers y RPCs de cada módulo (no se expone por la API).
create or replace function private.enqueue_shopify_job(
  p_kind text,
  p_entity_table text,
  p_entity_id text,
  p_payload jsonb default '{}',
  p_idempotency_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id bigint;
begin
  if p_idempotency_key is not null then
    select id into job_id from public.shopify_sync_jobs
    where idempotency_key = p_idempotency_key and status in ('pending', 'processing');
    if job_id is not null then
      return job_id;
    end if;
  end if;

  insert into public.shopify_sync_jobs (kind, entity_table, entity_id, payload, idempotency_key)
  values (p_kind, p_entity_table, p_entity_id, p_payload, p_idempotency_key)
  returning id into job_id;
  return job_id;
end;
$$;

revoke execute on function private.enqueue_shopify_job(text, text, text, jsonb, text)
  from public, anon, authenticated;

-- Toma hasta `p_limit` jobs vencidos para procesarlos. FOR UPDATE SKIP LOCKED evita que
-- dos procesadores tomen el mismo job; un job "processing" abandonado (el procesador se
-- cayó) se vuelve a tomar pasado `p_lock_timeout`.
create or replace function public.claim_shopify_jobs(
  p_limit integer default 10,
  p_lock_timeout interval default interval '5 minutes'
)
returns setof public.shopify_sync_jobs
language sql
security definer
set search_path = ''
as $$
  update public.shopify_sync_jobs as j
  set status = 'processing', locked_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from public.shopify_sync_jobs
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'processing' and locked_at < now() - p_lock_timeout)
    order by next_attempt_at, id
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

revoke execute on function public.claim_shopify_jobs(integer, interval)
  from public, anon, authenticated;
grant execute on function public.claim_shopify_jobs(integer, interval) to service_role;
