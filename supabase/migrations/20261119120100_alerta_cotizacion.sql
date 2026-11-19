-- Alertas de cotizaciones (pedido del 2026-11-19), con la misma campana y push de las
-- guías:
--   1. Cotización aceptada → logística (para asignar el taller y la ubicación).
--   2. Cotización facturada → administración (rol admin).
-- Reglas:
--   * Quien hace el cambio no recibe su propia alerta.
--   * Cada alerta se puede desactivar, editar o silenciar en Configuración → Alertas.
--   * Sin dinero: la alerta solo lleva el código de la cotización. El nombre del
--     cliente se muestra a admin y ventas, nunca a logística (igual que en las guías).
--   * Si la cotización se borra, se van sus alertas (on delete cascade).

-- 1. Una alerta pertenece a una guía o a una cotización (una de las dos).
alter table public.notifications alter column restoration_id drop not null;
alter table public.notifications
  add column quote_id uuid references public.quotes (id) on delete cascade;
alter table public.notifications
  add constraint notifications_subject_check
  check ((restoration_id is null) <> (quote_id is null));

-- El unique de las guías no deduplica con restoration_id nulo: uno propio para cotizaciones.
create unique index notifications_quote_unique_idx
  on public.notifications (recipient_id, kind, quote_id, txid)
  where quote_id is not null;
create index notifications_quote_idx on public.notifications (quote_id)
  where quote_id is not null;

-- 2. Configuración y destinatarios de cada alerta.
insert into public.alert_settings (id)
values ('cotizacion_aceptada'), ('cotizacion_facturada')
on conflict do nothing;

create or replace function private.alert_roles(p_kind public.alert_kind)
returns public.app_role[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('aprobacion_parcial', 'aprobacion_total') then '{admin,logistica}'
    when p_kind = 'cotizacion_aceptada' then '{logistica}'
    when p_kind = 'cotizacion_facturada' then '{admin}'
    else '{admin,ventas}'
  end::public.app_role[];
$$;

-- 3. Al pasar una cotización a Aceptada o Facturada.
create or replace function private.notify_quote_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.alert_kind;
  v_actor uuid := (select auth.uid());
  v_actor_name text;
begin
  v_kind := case new.status
    when 'aceptada' then 'cotizacion_aceptada'
    when 'facturada' then 'cotizacion_facturada'
  end::public.alert_kind;
  if v_kind is null then
    return null;
  end if;

  select p.full_name into v_actor_name from public.profiles p where p.id = v_actor;

  insert into public.notifications
    (recipient_id, kind, quote_id, actor_id, actor_name, txid)
  select p.id, k.id, new.id, v_actor, v_actor_name, txid_current()
  from public.alert_settings k
  join public.profiles p on p.active and p.role = any (private.alert_roles(k.id))
  where k.id = v_kind
    and k.enabled
    and not (p.id = any (k.muted_user_ids))
    and p.id is distinct from v_actor
  on conflict (recipient_id, kind, quote_id, txid) where quote_id is not null
  do nothing;

  -- Las leídas de más de 60 días se borran solas.
  delete from public.notifications n
  where n.read_at is not null and n.read_at < now() - interval '60 days';
  return null;
end;
$$;

revoke execute on function private.notify_quote_status() from public, anon, authenticated;

create trigger quotes_notify_status
  after update of status on public.quotes
  for each row
  when (old.status is distinct from new.status and new.status in ('aceptada', 'facturada'))
  execute function private.notify_quote_status();

-- 4. Alertas del usuario para la campana. Cambian las columnas devueltas: se vuelve a
-- crear. Logística no ve al cliente (P42): el nombre llega vacío.
drop function public.my_notifications(integer);
create function public.my_notifications(p_limit integer default 20)
returns table (
  id uuid,
  kind public.alert_kind,
  restoration_id uuid,
  restoration_code text,
  client_name text,
  actor_name text,
  data jsonb,
  pieces jsonb,
  created_at timestamptz,
  read_at timestamptz,
  unread_count bigint,
  quote_id uuid,
  quote_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role from public.profiles p where p.id = (select auth.uid()) and p.active
  )
  select n.id, n.kind, n.restoration_id, r.code,
    case when me.role in ('admin', 'ventas') then coalesce(c.display_name, q.client_name) end,
    n.actor_name, n.data,
    coalesce((
      select jsonb_agg(jsonb_build_object('code', pc.code, 'description', pc.description)
        order by pc.number)
      from private.notification_events e
      join public.pieces pc on pc.id = e.piece_id
      where e.notification_id = n.id
    ), '[]'),
    n.created_at, n.read_at,
    (select count(*) from public.notifications u where u.recipient_id = me.id and u.read_at is null),
    n.quote_id, q.code
  from me
  join public.notifications n on n.recipient_id = me.id and n.dismissed_at is null
  left join public.restorations r on r.id = n.restoration_id
  left join public.clients c on c.id = r.client_id
  left join public.quotes q on q.id = n.quote_id
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;

-- 5. Alertas pendientes de envío por push (solo el servidor).
drop function public.claim_push_notifications(integer);
create function public.claim_push_notifications(p_limit integer default 100)
returns table (
  id uuid,
  recipient_id uuid,
  kind public.alert_kind,
  restoration_id uuid,
  restoration_code text,
  client_name text,
  actor_name text,
  data jsonb,
  pieces jsonb,
  quote_id uuid,
  quote_code text
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
    case when pr.role in ('admin', 'ventas') then coalesce(c.display_name, q.client_name) end,
    n.actor_name, n.data,
    coalesce((
      select jsonb_agg(jsonb_build_object('code', pc.code, 'description', pc.description)
        order by pc.number)
      from private.notification_events e
      join public.pieces pc on pc.id = e.piece_id
      where e.notification_id = n.id
    ), '[]'),
    n.quote_id, q.code
  from claimed n
  join public.profiles pr on pr.id = n.recipient_id and pr.active
  left join public.restorations r on r.id = n.restoration_id
  left join public.clients c on c.id = r.client_id
  left join public.quotes q on q.id = n.quote_id;
$$;

revoke execute on function public.claim_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;
