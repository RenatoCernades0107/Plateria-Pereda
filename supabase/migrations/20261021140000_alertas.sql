-- Alertas internas con campana en el encabezado (pedido del 2026-10-21, D76).
--   1. Aprobación (admin y logística): se aprueban piezas de una guía. "Parcial" mientras
--      falten piezas vivas por aprobar; "Total" al aprobar la última.
--   2. Espera del cliente (admin y ventas): piezas que pasan a Espera respuesta cliente;
--      si con eso TODAS las piezas vivas de la guía quedan en espera, llega "Guía en
--      espera" en su lugar (a quien la tenga activa).
-- Reglas:
--   * Solo guías Normales. Quien hace el cambio no recibe su propia alerta.
--   * Una acción masiva da una sola alerta por guía y destinatario (misma transacción).
--   * Se calcula al confirmar la transacción (disparador diferido): así ve la guía ya
--     completa (p. ej., al registrarla con varias piezas).
--   * "Deshacer" borra el evento del historial y con él la alerta; "Retroceder estado"
--     quita la pieza de las alertas de ese paso (y la alerta, si se queda sin piezas).
--   * El admin activa o desactiva cada alerta, edita su mensaje (null = el de la app,
--     `DEFAULT_ALERT_TEMPLATES`) y elige qué usuarios la reciben (`muted_user_ids`).
--   * El mensaje se arma al leer (src/domain/alerts.ts), con la plantilla vigente.

-- 1. Tipos de alerta y roles que las reciben (igual que ALERT_ROLES de TypeScript).
create type public.alert_kind as enum (
  'aprobacion_parcial', 'aprobacion_total', 'pieza_en_espera', 'guia_en_espera'
);

create or replace function private.alert_roles(p_kind public.alert_kind)
returns public.app_role[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('aprobacion_parcial', 'aprobacion_total') then '{admin,logistica}'
    else '{admin,ventas}'
  end::public.app_role[];
$$;

revoke execute on function private.alert_roles(public.alert_kind) from public, anon;
grant execute on function private.alert_roles(public.alert_kind) to authenticated;

-- 2. Configuración de cada alerta (una fila por tipo).
-- La clave se llama `id` para la auditoría (audit.log_change usa la columna id).
create table public.alert_settings (
  id public.alert_kind primary key,
  enabled boolean not null default true,
  -- Vacío = el mensaje por defecto de la aplicación.
  template text check (length(template) <= 1000),
  -- Usuarios que no la reciben aunque su rol sí.
  muted_user_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.alert_settings is
  'Alertas de la campana: activa o no, mensaje propio y usuarios que no la reciben.';

insert into public.alert_settings (id)
select k from unnest(enum_range(null::public.alert_kind)) as k;

create trigger alert_settings_set_updated_at
  before update on public.alert_settings
  for each row execute function private.set_updated_at();

select audit.enable('public.alert_settings');

revoke all on public.alert_settings from anon, authenticated;
grant select, update on public.alert_settings to authenticated;
alter table public.alert_settings enable row level security;

create policy "Los usuarios leen la configuración de alertas"
  on public.alert_settings for select to authenticated
  using ((select private.current_app_role()) is not null);

create policy "Solo admin edita las alertas"
  on public.alert_settings for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));

-- 3. Alertas de cada usuario. Las escribe solo el disparador; cada uno marca las suyas.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind public.alert_kind not null,
  restoration_id uuid not null references public.restorations (id) on delete cascade,
  actor_id uuid,
  actor_name text,
  -- Contadores de la guía al confirmar: live, approved, waiting.
  data jsonb not null default '{}',
  -- Transacción que la generó: agrupa una acción masiva en una sola alerta.
  txid bigint not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, kind, restoration_id, txid)
);

comment on table public.notifications is
  'Alertas de la campana de cada usuario (aprobación de guías y espera del cliente).';

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_restoration_idx on public.notifications (restoration_id);

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
alter table public.notifications enable row level security;

create policy "Cada usuario lee sus alertas"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Cada usuario marca sus alertas como leídas"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- La campana se entera al instante de las alertas nuevas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- 4. Piezas de cada alerta: un evento del historial por pieza. Al borrar el evento
-- (Deshacer) se va la pieza; la alerta sin piezas se borra.
create table private.notification_events (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  history_id bigint not null references public.piece_status_history (id) on delete cascade,
  piece_id uuid not null references public.pieces (id) on delete cascade,
  primary key (notification_id, history_id)
);

create index notification_events_history_idx on private.notification_events (history_id);
create index notification_events_piece_idx on private.notification_events (piece_id);

revoke all on private.notification_events from public, anon, authenticated;

create or replace function private.drop_empty_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where n.id in (select o.notification_id from old_rows o)
    and not exists (select 1 from private.notification_events e where e.notification_id = n.id);
  return null;
end;
$$;

revoke execute on function private.drop_empty_notifications() from public, anon, authenticated;

create trigger notification_events_drop_empty
  after delete on private.notification_events
  referencing old table as old_rows
  for each statement execute function private.drop_empty_notifications();

-- 5. Al confirmar un cambio de estado: alertas para quien corresponda.
create or replace function private.notify_piece_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.alert_kind;
  v_live integer;
  v_approved integer;
  v_waiting integer;
  v_tx bigint := txid_current();
  v_recipient uuid;
  v_notification uuid;
  v_guide_kinds public.alert_kind[];
begin
  -- El evento pudo deshacerse antes de confirmar.
  if not exists (select 1 from public.piece_status_history h where h.id = new.id) then
    return null;
  end if;

  -- Retroceder estado: la pieza sale de las alertas del paso que se deshizo.
  if new.event = 'retroceso' then
    delete from private.notification_events e
    using public.notifications n
    where n.id = e.notification_id
      and e.piece_id = new.piece_id
      and n.kind = any (case new.from_status
        when 'aprobada' then '{aprobacion_parcial,aprobacion_total}'
        when 'en_espera' then '{pieza_en_espera,guia_en_espera}'
        else '{}' end::public.alert_kind[]);
    return null;
  end if;

  if new.event <> 'estado' or new.to_status not in ('aprobada', 'en_espera')
     or new.from_status is not distinct from new.to_status then
    return null;
  end if;
  if not exists (
    select 1 from public.restorations r where r.id = new.restoration_id and r.kind = 'normal'
  ) then
    return null;
  end if;

  select count(*) filter (where p.status not in ('anulada', 'rechazada', 'sin_arreglo')),
    count(*) filter (where p.status not in ('anulada', 'rechazada', 'sin_arreglo')
      and p.approved_at is not null),
    count(*) filter (where p.status = 'en_espera')
  into v_live, v_approved, v_waiting
  from public.pieces p where p.restoration_id = new.restoration_id;

  -- Para cada destinatario se elige qué alerta recibe.
  for v_recipient, v_kind in
    with candidates as (
      select k.id as kind, p.id as user_id
      from public.alert_settings k
      join public.profiles p on p.active and p.role = any (private.alert_roles(k.id))
      where k.enabled
        and not (p.id = any (k.muted_user_ids))
        and p.id is distinct from new.actor_id
        and k.id = any (case
          when new.to_status = 'aprobada' and v_approved >= v_live then '{aprobacion_total}'
          when new.to_status = 'aprobada' then '{aprobacion_parcial}'
          when v_waiting >= v_live then '{guia_en_espera,pieza_en_espera}'
          else '{pieza_en_espera}'
        end::public.alert_kind[])
    )
    -- "Guía en espera" reemplaza a "Pieza en espera" para quien recibe las dos.
    select distinct on (c.user_id) c.user_id, c.kind
    from candidates c
    order by c.user_id, (c.kind = 'guia_en_espera') desc
  loop
    insert into public.notifications as n
      (recipient_id, kind, restoration_id, actor_id, actor_name, data, txid)
    values (
      v_recipient, v_kind, new.restoration_id, new.actor_id, new.actor_name,
      jsonb_build_object('live', v_live, 'approved', v_approved, 'waiting', v_waiting), v_tx
    )
    on conflict (recipient_id, kind, restoration_id, txid) do update
      set data = excluded.data
    returning n.id into v_notification;

    insert into private.notification_events (notification_id, history_id, piece_id)
    values (v_notification, new.id, new.piece_id)
    on conflict do nothing;
  end loop;

  -- Las leídas de más de 60 días se borran solas.
  delete from public.notifications n
  where n.read_at is not null and n.read_at < now() - interval '60 days';
  return null;
end;
$$;

revoke execute on function private.notify_piece_status() from public, anon, authenticated;

create constraint trigger piece_status_history_notify
  after insert on public.piece_status_history
  deferrable initially deferred
  for each row execute function private.notify_piece_status();

-- 6. Alertas del usuario para la campana, con lo necesario para armar el mensaje.
-- Logística no ve al cliente (P42): el nombre llega vacío.
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
  join public.notifications n on n.recipient_id = me.id
  join public.restorations r on r.id = n.restoration_id
  join public.clients c on c.id = r.client_id
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;
