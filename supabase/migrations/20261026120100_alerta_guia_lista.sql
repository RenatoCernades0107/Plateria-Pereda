-- Alerta "Guía lista para entregar" (pedido del 2026-10-26, D77): cuando el estado
-- general de una guía pasa a Lista (todas sus piezas vivas ya volvieron del taller o
-- se entregaron), admin y ventas reciben la alerta para avisarle al cliente.
--   * Solo guías Normales; quien hace el cambio no la recibe.
--   * Se detecta al confirmar la transacción: la guía quedó en Lista y su estado, antes
--     del primer movimiento de esta transacción (foto de "Deshacer"), era otro. Todas
--     las piezas movidas en esa transacción quedan en la alerta; una acción masiva da
--     una sola alerta por destinatario.
--   * "Deshacer" borra el evento del historial y con él la alerta (como las demás).

insert into public.alert_settings (id) values ('guia_lista') on conflict do nothing;

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
  v_estado boolean;
  v_lista boolean;
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

  if not exists (
    select 1 from public.restorations r where r.id = new.restoration_id and r.kind = 'normal'
  ) then
    return null;
  end if;

  v_estado := new.event = 'estado' and new.to_status in ('aprobada', 'en_espera')
    and new.from_status is distinct from new.to_status;

  -- ¿La guía pasó a Lista en esta transacción? Su estado antes del primer movimiento
  -- de la transacción lo guarda la foto de "Deshacer".
  select r.status = 'lista' and s.prev is not null and s.prev <> 'lista'
  into v_lista
  from public.restorations r
  left join lateral (
    select sn.restoration_status as prev
    from private.piece_move_snapshots sn
    join public.pieces p on p.id = sn.piece_id
    where p.restoration_id = r.id and sn.txid = v_tx
    order by sn.id
    limit 1
  ) s on true
  where r.id = new.restoration_id;
  v_lista := coalesce(v_lista, false);

  if not v_estado and not v_lista then
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
    with wanted as (
      select (
        case when v_estado then
          case
            when new.to_status = 'aprobada' and v_approved >= v_live then array['aprobacion_total']
            when new.to_status = 'aprobada' then array['aprobacion_parcial']
            when v_waiting >= v_live then array['guia_en_espera', 'pieza_en_espera']
            else array['pieza_en_espera']
          end
        else array[]::text[] end
        || case when v_lista then array['guia_lista'] else array[]::text[] end
      )::public.alert_kind[] as kinds
    ),
    candidates as (
      select k.id as kind, p.id as user_id
      from wanted w
      cross join public.alert_settings k
      join public.profiles p on p.active and p.role = any (private.alert_roles(k.id))
      where k.enabled
        and not (p.id = any (k.muted_user_ids))
        and p.id is distinct from new.actor_id
        and k.id = any (w.kinds)
    )
    -- "Guía en espera" reemplaza a "Pieza en espera" para quien recibe las dos.
    select distinct on (c.user_id, (c.kind = 'guia_lista')) c.user_id, c.kind
    from candidates c
    order by c.user_id, (c.kind = 'guia_lista'), (c.kind = 'guia_en_espera') desc
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
