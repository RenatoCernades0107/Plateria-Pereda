-- Fusión de duplicados (corrección del 2026-10-31): si el cliente que se queda no
-- estaba en Shopify y el duplicado sí, el vínculo (`shopify_customer_id`) pasa al que se
-- queda. Antes quedaba en el duplicado y el alta del que se queda chocaba con la clave
-- única al vincular ese mismo Customer («duplicate key … clients_shopify_customer_id_key»).
-- Fuera de eso, igual que en 20261031120000.

create or replace function public.merge_clients(p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.clients;
  v_remove public.clients;
  v_restorations integer;
  v_quotes integer;
  v_whatsapp integer;
  v_today text := to_char(private.lima_today(), 'DD/MM/YYYY');
  v_data text;
begin
  if not private.has_role('{admin}') then
    raise exception 'Solo el administrador puede fusionar clientes' using errcode = '42501';
  end if;
  if p_keep is not distinct from p_remove then
    raise exception 'Elige dos clientes distintos' using errcode = '23514';
  end if;

  -- En orden de id, para que dos fusiones a la vez no se bloqueen entre sí.
  perform 1 from public.clients where id in (p_keep, p_remove) order by id for update;
  select * into v_keep from public.clients where id = p_keep;
  select * into v_remove from public.clients where id = p_remove;
  if v_keep.id is null or v_remove.id is null then
    raise exception 'El cliente no existe' using errcode = '23514';
  end if;
  if v_keep.kind <> 'persona' or v_remove.kind <> 'persona' then
    raise exception 'Por ahora solo se pueden fusionar personas' using errcode = '23514';
  end if;
  if v_keep.merged_into is not null or v_remove.merged_into is not null then
    raise exception 'Uno de los clientes ya se fusionó con otro' using errcode = '23514';
  end if;

  perform set_config('app.merging_clients', 'on', true);
  update public.restorations set client_id = p_keep where client_id = p_remove;
  get diagnostics v_restorations = row_count;
  update public.quotes set client_id = p_keep where client_id = p_remove;
  get diagnostics v_quotes = row_count;
  update public.whatsapp_quotes set client_id = p_keep where client_id = p_remove;
  get diagnostics v_whatsapp = row_count;
  perform set_config('app.merging_clients', '', true);

  update public.clients
  set merged_into = p_keep,
    active = false,
    document_type = null,
    document_number = null,
    -- El vínculo con Shopify pasa al que se queda si no tenía (es la misma persona).
    shopify_customer_id = case when v_keep.shopify_customer_id is null then null
      else shopify_customer_id end,
    notes = left(ltrim(notes || E'\n' || format('Fusionado en %s el %s.', v_keep.display_name, v_today), E'\n'), 2000)
  where id = p_remove;

  v_data := concat_ws(', ',
    case when v_remove.phone is distinct from v_keep.phone then 'tel. ' || v_remove.phone end,
    case when v_remove.email is distinct from v_keep.email then v_remove.email end
  );
  update public.clients
  set document_type = coalesce(v_keep.document_type, v_remove.document_type),
    document_number = coalesce(v_keep.document_number, v_remove.document_number),
    shopify_customer_id = coalesce(v_keep.shopify_customer_id, v_remove.shopify_customer_id),
    active = true,
    notes = left(ltrim(notes || E'\n' || format(
      'Fusionado con %s el %s%s.', v_remove.display_name, v_today,
      case when v_data <> '' then ' (' || v_data || ')' else '' end
    ), E'\n'), 2000)
  where id = p_keep;

  return jsonb_build_object(
    'restorations', v_restorations,
    'quotes', v_quotes,
    'whatsappQuotes', v_whatsapp
  );
end;
$$;

-- Las fusiones ya hechas: el vínculo pasa del duplicado al que se quedó, si no tenía.
create temporary table moved_shopify_links on commit drop as
  select distinct on (r.merged_into)
    r.id as remove_id, r.merged_into as keep_id, r.shopify_customer_id
  from public.clients r
  join public.clients k on k.id = r.merged_into
  where r.shopify_customer_id is not null and k.shopify_customer_id is null
  order by r.merged_into, r.updated_at desc;

update public.clients c set shopify_customer_id = null
from moved_shopify_links m where c.id = m.remove_id;

update public.clients c set shopify_customer_id = m.shopify_customer_id
from moved_shopify_links m where c.id = m.keep_id;
