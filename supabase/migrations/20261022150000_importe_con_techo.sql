-- Importe de la pieza con techo (pedido del 2026-10-22): con más de una unidad,
-- precio × cantidad se redondea hacia arriba al sol entero (3 × S/ 26.66 = S/ 80.00).
-- Con una unidad se cobra el precio tal cual. Lo usan el total de la restauración y el
-- de la cotización de WhatsApp; la app aplica la misma regla (`lineCents`).

create or replace function private.piece_amount(p_price numeric, p_quantity integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_quantity > 1 then ceil(p_price * p_quantity) else p_price end;
$$;

revoke execute on function private.piece_amount(numeric, integer) from public, anon, authenticated;

create or replace function private.restoration_total(p_restoration_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(private.piece_amount(p.price, p.quantity), 0)), 0)
  from public.pieces p
  where p.restoration_id = p_restoration_id
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

create or replace function private.whatsapp_quote_total(p_quote_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(private.piece_amount(i.price, i.quantity), 0)), 0)
  from public.whatsapp_quote_items i
  where i.quote_id = p_quote_id;
$$;

comment on column public.pieces.quantity is
  'Cantidad de unidades: el importe es precio × cantidad, con más de una redondeado hacia arriba al sol.';
comment on column public.whatsapp_quote_items.quantity is
  'Cantidad de unidades: el importe es precio × cantidad, con más de una redondeado hacia arriba al sol.';

-- Totales guardados con la nueva regla.
update public.restorations r
set total = private.restoration_total(r.id)
where r.total is distinct from private.restoration_total(r.id);

update public.whatsapp_quotes q
set total = private.whatsapp_quote_total(q.id)
where q.total is distinct from private.whatsapp_quote_total(q.id);
