-- Fechas de entrega de las cotizaciones aceptadas (`COT-`, pedido del 2026-11-03), como
-- las de las piezas urgentes (20261027130000_fecha_entrega_taller.sql):
--   * `delivery_date`: fecha de entrega al cliente. Se indica al marcar la cotización
--     aceptada (el cliente la aprobó) y es obligatoria desde entonces.
--   * `supplier_delivery_date`: fecha en que el proveedor entrega. Si no se indica,
--     queda 3 días antes de la de entrega (sin pasar de hoy); nunca es posterior.
--   * Ambas se pueden cambiar mientras la cotización siga aceptada (admin y ventas, como
--     el resto del cotizador). Si vuelve a emitida, se borran.

alter table public.quotes
  add column delivery_date date,
  add column supplier_delivery_date date;

comment on column public.quotes.delivery_date is
  'Fecha de entrega al cliente. Solo en cotizaciones aceptadas (obligatoria al aceptarla).';
comment on column public.quotes.supplier_delivery_date is
  'Fecha en que el proveedor entrega. Solo en aceptadas; por defecto 3 días antes de la de entrega (sin pasar de hoy) y nunca posterior a ella.';

grant update (delivery_date, supplier_delivery_date) on public.quotes to authenticated;

-- Reemplaza a la de 20261103130000: agrega las reglas de las fechas de entrega.
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

  -- Fechas de entrega: solo en las aceptadas.
  if new.status <> 'aceptada' then
    new.delivery_date := null;
    new.supplier_delivery_date := null;
    return new;
  end if;

  -- Obligatoria al aceptarla (o si se intenta borrar); las aceptadas de antes pueden
  -- seguir sin fecha hasta que se les coloque.
  if new.delivery_date is null
     and (old.status <> 'aceptada' or old.delivery_date is not null) then
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
