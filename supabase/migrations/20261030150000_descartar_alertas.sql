-- Cada usuario puede ocultar sus alertas de la campana. No se borran: quedan como
-- historial. Al ocultarla también se marca como leída, así no cuenta como sin leer,
-- no se envía por push y la limpieza de leídas (60 días) la borra con las demás.
alter table public.notifications add column dismissed_at timestamptz;

grant update (dismissed_at) on public.notifications to authenticated;

-- La campana ya no muestra las ocultas.
create or replace function public.my_notifications(p_limit integer default 20)
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
  unread_count bigint
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
    case when me.role in ('admin', 'ventas') then c.display_name end,
    n.actor_name, n.data,
    coalesce((
      select jsonb_agg(jsonb_build_object('code', pc.code, 'description', pc.description)
        order by pc.number)
      from private.notification_events e
      join public.pieces pc on pc.id = e.piece_id
      where e.notification_id = n.id
    ), '[]'),
    n.created_at, n.read_at,
    (select count(*) from public.notifications u where u.recipient_id = me.id and u.read_at is null)
  from me
  join public.notifications n on n.recipient_id = me.id and n.dismissed_at is null
  join public.restorations r on r.id = n.restoration_id
  join public.clients c on c.id = r.client_id
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;
