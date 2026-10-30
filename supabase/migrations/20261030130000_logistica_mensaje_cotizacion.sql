-- Logística (pedido del 2026-10-30, corrección):
--   * Ya no ve las cotizaciones del cotizador (se quita la lectura agregada en
--     20261030120000).
--   * Ve el "Mensaje de cotización" de la guía para WhatsApp igual que admin y ventas:
--     lleva el nombre, el documento y el teléfono del cliente y el adelanto. Logística no
--     lee `clients`, `contacts` ni el dinero de `restorations`: estos datos le llegan por
--     RPC, solo de guías activas (D24).

-- 1. Sin cotizaciones para logística.
drop policy if exists "Logística lee las cotizaciones" on public.quotes;
drop policy if exists "Logística lee las líneas de las cotizaciones" on public.quote_items;

-- 2. Datos del cliente y del adelanto para el mensaje de cotización.
create function public.restoration_quote_message_data(p_restoration_id uuid)
returns table (
  client_name text,
  client_document_number text,
  client_phone text,
  contact_name text,
  contact_phone text,
  total numeric,
  deposit_percent numeric,
  deposit_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.display_name, c.document_number, c.phone, k.display_name, k.phone,
    r.total, r.deposit_percent, r.deposit_amount
  from public.restorations r
  join public.clients c on c.id = r.client_id
  left join public.contacts k on k.id = r.contact_id
  where r.id = p_restoration_id
    and private.current_app_role() is not null
    and (private.has_role('{admin,ventas}') or not private.is_past_restoration(r.id, r.status));
$$;

revoke execute on function public.restoration_quote_message_data(uuid) from public, anon;
grant execute on function public.restoration_quote_message_data(uuid) to authenticated;
