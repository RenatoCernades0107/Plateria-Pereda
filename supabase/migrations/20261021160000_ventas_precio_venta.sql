-- Ventas asigna y cambia el precio de venta de las piezas (pedido del 2026-10-21).
--   Como el admin y logística: directo sin la orden de Shopify (o si la pieza no tiene
--   precio) y con motivo si la orden ya existe (`change_piece_price`). Ventas ve las
--   guías pasadas, así que tampoco se limita a las activas (eso sigue solo para
--   logística, D24). Los guards de la pieza siguen aplicando.

-- 1. El guard del precio deja pasar a ventas.
create or replace function private.guard_piece_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.price is null)
     or (tg_op = 'UPDATE' and new.price is not distinct from old.price) then
    return new;
  end if;
  -- Copia del precio cotizado por WhatsApp, cambio de precio con la orden creada y
  -- precios vaciados al cambiar el tipo de guía.
  if coalesce(current_setting('app.quote_copy_price', true), '') = 'on'
     or coalesce(current_setting('app.shopify_order_edit', true), '') = 'on'
     or (new.price is null and coalesce(current_setting('app.restoration_kind_change', true), '') = 'on') then
    return new;
  end if;
  -- Se exige en las peticiones de usuarios (rol `authenticated`, también dentro de
  -- funciones security definer). La clave secreta y el mantenimiento no pasan por aquí.
  -- (Dos IF: la clave secreta no puede ejecutar private.has_role.)
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if not private.has_role('{admin,ventas,logistica}') then
    raise exception 'Solo el administrador, ventas y logística asignan el precio de venta.' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on column public.pieces.price is
  'Precio de venta. Null: sin asignar; lo asignan el admin, ventas y logística.';

-- 2. Asignar o cambiar el precio sin la orden de Shopify: también ventas.
create or replace function public.set_piece_sale_price(p_piece_id uuid, p_price numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece public.pieces;
begin
  if not (select private.has_role('{admin,ventas,logistica}')) then
    raise exception 'Solo el administrador, ventas y logística asignan el precio de venta.' using errcode = '42501';
  end if;
  if p_price is not null
     and (p_price < 0 or round(p_price, 2) <> p_price or p_price >= 10000000000) then
    raise exception 'Ingresa un monto válido (hasta 2 decimales).' using errcode = '22023';
  end if;

  -- Logística, solo en guías activas (D24); el admin y ventas, en cualquiera.
  select p.* into v_piece
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.id = p_piece_id
    and ((select private.has_role('{admin,ventas}')) or not private.is_past_restoration(r.id, r.status))
  for update of p;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;

  update public.pieces p set price = p_price
  where p.id = p_piece_id and p.price is distinct from p_price;
  return v_piece.restoration_id;
end;
$$;

revoke execute on function public.set_piece_sale_price(uuid, numeric) from public, anon;
grant execute on function public.set_piece_sale_price(uuid, numeric) to authenticated;

-- 3. Cambio de precio con la orden creada (P12), con motivo: también ventas.
create or replace function public.change_piece_price(
  p_piece_id uuid,
  p_price numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece public.pieces;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not (select private.has_role('{admin,ventas,logistica}')) then
    raise exception 'Solo el administrador, ventas y logística cambian el precio con la orden creada.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Escribe el motivo del cambio de precio.' using errcode = '23514';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'El motivo tiene más de 1000 caracteres' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 or round(p_price, 2) <> p_price then
    raise exception 'Ingresa un precio válido (hasta 2 decimales).' using errcode = '22023';
  end if;

  select p.* into v_piece
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.id = p_piece_id
    and ((select private.has_role('{admin,ventas}')) or not private.is_past_restoration(r.id, r.status))
  for update of p;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;
  if v_piece.price = p_price then
    return;
  end if;

  -- El guard de la pieza deja cambiar el precio con la orden creada solo por esta vía.
  perform set_config('app.shopify_order_edit', 'on', true);
  update public.pieces p set price = p_price where p.id = p_piece_id
  returning * into v_piece;
  perform set_config('app.shopify_order_edit', '', true);

  perform private.add_status_history(v_piece, v_piece.status, v_piece.status, v_reason, 'cambio_precio');
end;
$$;

revoke execute on function public.change_piece_price(uuid, numeric, text) from public, anon;
grant execute on function public.change_piece_price(uuid, numeric, text) to authenticated;
