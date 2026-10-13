-- El taller de la pieza lo asignan o cambian solo logística y el admin (D60, P53).
-- Ventas lo ve, pero no lo elige al registrar ni lo cambia después.

-- 1. "Asignar taller" (acción en bloque): sin ventas.
create or replace function public.assign_piece_workshop(p_piece_ids uuid[], p_workshop_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Solo logística y el administrador asignan el taller.' using errcode = '42501';
  end if;
  if p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.pieces p
    where p.id = any (p_piece_ids)
      and p.status in ('enviada_taller', 'entregada', 'anulada', 'rechazada', 'sin_arreglo')
  ) then
    raise exception 'No se cambia el taller de una pieza que está en el taller, entregada o cerrada.'
      using errcode = '23514';
  end if;
  if (select private.has_role('{logistica}')) and exists (
    select 1 from public.pieces p join public.restorations r on r.id = p.restoration_id
    where p.id = any (p_piece_ids) and private.is_past_restoration(r.id, r.status)
  ) then
    raise exception 'Tu rol no puede asignar talleres.' using errcode = '42501';
  end if;

  update public.pieces p set workshop_id = p_workshop_id
  where p.id = any (p_piece_ids) and p.workshop_id is distinct from p_workshop_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 2. Cualquier otro camino (edición directa de la pieza, "Agregar pieza",
--    create_restoration y la copia de una cotización): solo logística y el admin
--    ponen o cambian el taller. Ventas registra y edita sin tocarlo.
create or replace function private.guard_piece_workshop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.workshop_id is null)
     or (tg_op = 'UPDATE' and new.workshop_id is not distinct from old.workshop_id) then
    return new;
  end if;
  -- Se exige en las peticiones de usuarios (rol `authenticated`, también dentro de
  -- funciones security definer). La clave secreta y el mantenimiento no pasan por aquí.
  -- (Dos IF: la clave secreta no puede ejecutar private.has_role.)
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if not private.has_role('{admin,logistica}') then
    raise exception 'Solo logística y el administrador asignan el taller.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_piece_workshop() from public, anon, authenticated;

create trigger pieces_guard_workshop
  before insert or update of workshop_id on public.pieces
  for each row execute function private.guard_piece_workshop();
