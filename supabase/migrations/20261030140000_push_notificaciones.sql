-- Notificaciones push de las alertas (pedido del 2026-10-30): la alerta también llega
-- como aviso del teléfono o la computadora, aunque la app esté cerrada.
--   * Cada usuario activa el aviso en la campana; el navegador entrega una suscripción
--     (endpoint + claves) que se guarda aquí, una por dispositivo.
--   * Al crearse alertas, la BD llama con pg_net a `APP_URL/api/webhooks/push`
--     (Bearer CRON_SECRET), que arma el mensaje con la plantilla vigente y lo envía.
--     La URL y el secreto se guardan en Vault (`push_dispatch_url`,
--     `push_dispatch_secret`); sin ellos (local, CI) no se llama a nadie.
--   * `pushed_at` marca las alertas ya enviadas: la ruta toma las pendientes de la
--     última hora, así un aviso perdido sale con el siguiente y nunca se repite.

create extension if not exists pg_net with schema extensions;

-- 1. Suscripciones de cada dispositivo.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  user_agent text check (length(user_agent) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Dispositivos de cada usuario que reciben las alertas como notificación push.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Las guarda el servidor con la clave secreta (push-actions): el mismo navegador puede
-- pasar a otro usuario al cambiar de sesión y el endpoint se reasigna. Cada usuario ve
-- y quita los suyos.
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;

create policy "Cada usuario ve sus dispositivos"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Cada usuario quita sus dispositivos"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- 2. Alertas ya enviadas por push.
alter table public.notifications add column pushed_at timestamptz;

create index notifications_push_pending_idx on public.notifications (created_at)
  where pushed_at is null;

-- 3. Toma las alertas pendientes de envío (solo el servidor). El cliente no se muestra
-- a logística, igual que en la campana.
create or replace function public.claim_push_notifications(p_limit integer default 100)
returns table (
  id uuid,
  recipient_id uuid,
  kind public.alert_kind,
  restoration_id uuid,
  restoration_code text,
  client_name text,
  actor_name text,
  data jsonb,
  pieces jsonb
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications n
    set pushed_at = now()
    where n.id in (
      select p.id from public.notifications p
      where p.pushed_at is null
        and p.read_at is null
        and p.created_at > now() - interval '1 hour'
        and exists (select 1 from public.push_subscriptions s where s.user_id = p.recipient_id)
      order by p.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
      for update skip locked
    )
    returning n.*
  )
  select n.id, n.recipient_id, n.kind, n.restoration_id, r.code,
    case when pr.role in ('admin', 'ventas') then c.display_name end,
    n.actor_name, n.data,
    coalesce((
      select jsonb_agg(jsonb_build_object('code', pc.code, 'description', pc.description)
        order by pc.number)
      from private.notification_events e
      join public.pieces pc on pc.id = e.piece_id
      where e.notification_id = n.id
    ), '[]')
  from claimed n
  join public.profiles pr on pr.id = n.recipient_id and pr.active
  join public.restorations r on r.id = n.restoration_id
  join public.clients c on c.id = r.client_id;
$$;

revoke execute on function public.claim_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

-- 4. Aviso a la app al crearse alertas. pg_net solo encola el pedido si la transacción
-- se confirma; lo envía en segundo plano, sin demorar a quien hizo el cambio.
create or replace function private.request_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  select
    max(s.decrypted_secret) filter (where s.name = 'push_dispatch_url'),
    max(s.decrypted_secret) filter (where s.name = 'push_dispatch_secret')
  into v_url, v_secret
  from vault.decrypted_secrets s
  where s.name in ('push_dispatch_url', 'push_dispatch_secret');
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- Una falla del aviso nunca debe deshacer el cambio de estado.
  raise warning 'No se pudo pedir el envío push: %', sqlerrm;
  return null;
end;
$$;

revoke execute on function private.request_push_dispatch() from public, anon, authenticated;

create trigger notifications_request_push
  after insert on public.notifications
  for each statement execute function private.request_push_dispatch();
