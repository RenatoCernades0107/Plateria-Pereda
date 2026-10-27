-- "Employee" del pedido de Shopify. La API no deja asignar el empleado al crear un
-- pedido: lo toma de quien lo crea. Por eso el sistema ya no crea el pedido de cada
-- pago: crea un borrador (draft order) y el empleado de la sucursal lo abre en Shopify
-- y pulsa "Crear pedido". El cobro ya está registrado en el sistema: al nacer el
-- pedido, el job lo registra en él. Cada pago guarda su borrador hasta que tenga pedido.
alter table public.payments
  add column shopify_draft_order_id text unique,
  add column shopify_draft_order_name text;

comment on column public.payments.shopify_draft_order_id is
  'Borrador de Shopify de este pago: el empleado lo convierte en pedido (así queda como Employee).';
comment on column public.payments.shopify_draft_order_name is
  'Nombre del borrador como lo muestra Shopify (#D1).';
