-- Cotizaciones: instrucciones para el taller (pedido del 2026-11-06). Van en el PDF
-- «Orden para taller» en lugar de las notas para el cliente. Se editan en cualquier
-- estado (el taller suele recibir la cotización ya aceptada), así que no entran en la
-- guarda de `quote_guard_update`. Al duplicar se copian.

alter table public.quotes
  add column workshop_notes text not null default ''
    check (length(workshop_notes) <= 2000);

comment on column public.quotes.workshop_notes is
  'Instrucciones o notas para el taller (PDF «Orden para taller»); no las ve el cliente.';

grant insert (workshop_notes), update (workshop_notes) on public.quotes to authenticated;

-- Duplicar copia también las instrucciones para taller (resto como 20261105120100).
create or replace function public.duplicate_quote(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.quotes (
    id, client_id, contact_id, validity_days, notes, terms, payment_condition,
    delivery_days, apply_igv, credit_days, issuer_id, workshop_notes, duplicated_from
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms,
    q.payment_condition, q.delivery_days, q.apply_igv, q.credit_days, q.issuer_id,
    q.workshop_notes, q.id
  from public.quotes q
  where q.id = p_id;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;

  insert into public.quote_items (
    quote_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
    image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value, reference_image_path
  )
  select v_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
    image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value, reference_image_path
  from public.quote_items
  where quote_id = p_id
  order by position;

  return v_id;
end;
$function$;
