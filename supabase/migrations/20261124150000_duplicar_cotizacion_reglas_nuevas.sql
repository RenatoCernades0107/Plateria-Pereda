-- Duplicar una cotización crea la copia con las reglas nuevas: los precios incluyen IGV
-- (prices_include_igv = true), también si la original es anterior y se escribió sin IGV.
-- Se copian los precios tal cual; el total de la copia se calcula con la regla nueva.

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
    delivery_days, apply_igv, prices_include_igv, credit_days, issuer_id, workshop_notes,
    duplicated_from
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms,
    q.payment_condition, q.delivery_days, q.apply_igv, true,
    q.credit_days, q.issuer_id, q.workshop_notes, q.id
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
