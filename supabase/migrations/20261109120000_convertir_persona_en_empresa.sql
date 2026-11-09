-- Convertir una persona en empresa (solo admin). El cliente conserva su id, así que sus
-- guías, cotizaciones y pagos siguen con él. En Shopify un Customer no se convierte en
-- Company: se crea la Company y, si la persona se queda como contacto, su Customer se
-- asigna a la Company (no se duplica). Si no se queda, su Customer sigue en Shopify con
-- su historial, sin vínculo con el sistema.

create function private.converting_client()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.converting_client', true), '') = 'on';
$$;

grant execute on function private.converting_client() to authenticated;

-- Un cliente no cambia de tipo (los ids de Shopify dependen de él), salvo de persona a
-- empresa dentro de convert_client_to_company.
create or replace function private.prevent_client_kind_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> old.kind and not (
    private.converting_client() and old.kind = 'persona' and new.kind = 'empresa'
  ) then
    raise exception 'No se puede cambiar el tipo de cliente' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.convert_client_to_company(
  p_client uuid,
  p_legal_name text,
  p_ruc text,
  p_phone text,
  p_address text,
  p_city text,
  p_region text,
  p_notes text,
  p_keep_as_contact boolean,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.clients;
  v_contact uuid;
  v_today text := to_char(private.lima_today(), 'DD/MM/YYYY');
begin
  if not private.has_role('{admin}') then
    raise exception 'Solo el administrador puede convertir clientes en empresa'
      using errcode = '42501';
  end if;

  select * into v from public.clients where id = p_client for update;
  if v.id is null then
    raise exception 'El cliente no existe' using errcode = '23514';
  end if;
  if v.kind <> 'persona' then
    raise exception 'El cliente ya es una empresa' using errcode = '23514';
  end if;
  if not v.active or v.merged_into is not null then
    raise exception 'Solo se pueden convertir clientes activos' using errcode = '23514';
  end if;

  -- La persona aún no estaba en Shopify: su alta (o la actualización) ya no sirve. Si un
  -- procesador la está enviando justo ahora, se espera a que termine.
  if exists (
    select 1 from public.shopify_sync_jobs
    where entity_table = 'clients' and entity_id = p_client::text
      and kind like 'customer.%' and status = 'processing'
  ) then
    raise exception 'El cliente se está sincronizando con Shopify; inténtalo en unos segundos'
      using errcode = '23514';
  end if;
  update public.shopify_sync_jobs
  set status = 'ok', result = '{"skipped": true, "reason": "convertido en empresa"}',
    completed_at = now(), locked_at = null
  where entity_table = 'clients' and entity_id = p_client::text
    and kind like 'customer.%' and status in ('pending', 'error');

  perform set_config('app.converting_client', 'on', true);
  update public.clients
  set kind = 'empresa',
    legal_name = p_legal_name,
    first_name = '',
    last_name = '',
    document_type = 'ruc',
    document_number = p_ruc,
    phone = p_phone,
    contact_phone = null,
    email = p_email,
    address = p_address,
    city = p_city,
    region = p_region,
    shopify_customer_id = null,
    notes = left(ltrim(p_notes || E'\n' || format(
      'Convertido de persona (%s) a empresa el %s.', v.display_name, v_today
    ), E'\n'), 2000)
  where id = p_client;
  perform set_config('app.converting_client', '', true);

  -- La Company se encola antes que el contacto: el procesador sigue el orden de los
  -- jobs, así el contacto se asigna en la misma pasada. Otra clave que la del alta
  -- (`client:<id>`), por si esa quedó tomada.
  perform private.enqueue_shopify_job(
    'company.create', 'clients', p_client::text, '{}', 'client-company:' || p_client
  );

  if p_keep_as_contact then
    -- Con el Customer de la persona, el alta del contacto (trigger) lo asigna a la
    -- Company en vez de crear otro.
    insert into public.contacts (
      client_id, first_name, last_name, document_type, document_number, phone, email,
      shopify_customer_id
    )
    values (
      p_client, v.first_name, v.last_name, v.document_type, v.document_number, v.phone,
      v.email, v.shopify_customer_id
    )
    returning id into v_contact;
  end if;

  return jsonb_build_object(
    'contactId', v_contact,
    'hadShopifyCustomer', v.shopify_customer_id is not null
  );
end;
$$;

revoke execute on function public.convert_client_to_company(
  uuid, text, text, text, text, text, text, text, boolean, text
) from public, anon;
grant execute on function public.convert_client_to_company(
  uuid, text, text, text, text, text, text, text, boolean, text
) to authenticated;
