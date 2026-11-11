-- Al convertir una persona en empresa sin conservarla como contacto, su Customer de
-- Shopify se borra si no tiene pedidos (job customer.delete). Si no se puede borrar,
-- queda en Shopify sin vínculo: se recuerda aquí para que la importación de clientes
-- no lo vuelva a traer como una persona nueva.

create table public.unlinked_shopify_customers (
  shopify_customer_id text primary key check (shopify_customer_id ~ '^gid://shopify/Customer/\d+$'),
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.unlinked_shopify_customers is
  'Customers de Shopify de personas convertidas en empresa que no quedaron de contacto: la importación no los vuelve a traer.';

create index unlinked_shopify_customers_client_idx
  on public.unlinked_shopify_customers (client_id);

revoke all on public.unlinked_shopify_customers from anon, authenticated;
grant select on public.unlinked_shopify_customers to authenticated;

alter table public.unlinked_shopify_customers enable row level security;

create policy "Solo admin lee los clientes de Shopify desvinculados"
  on public.unlinked_shopify_customers for select to authenticated
  using ((select private.has_role('{admin}')));

-- Como en 20261109120000_convertir_persona_en_empresa.sql, más el borrado del Customer
-- cuando la persona no se queda como contacto.
create or replace function public.convert_client_to_company(
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
  elsif v.shopify_customer_id is not null then
    -- No se queda: su Customer se borra de Shopify si no tiene pedidos. Si no se puede,
    -- queda allí sin vínculo, y se recuerda para que la importación no lo traiga de
    -- vuelta como persona.
    insert into public.unlinked_shopify_customers (shopify_customer_id, client_id)
    values (v.shopify_customer_id, p_client)
    on conflict (shopify_customer_id) do nothing;
    perform private.enqueue_shopify_job(
      'customer.delete', 'clients', p_client::text,
      jsonb_build_object('customerId', v.shopify_customer_id),
      'customer-delete:' || v.shopify_customer_id
    );
  end if;

  return jsonb_build_object(
    'contactId', v_contact,
    'hadShopifyCustomer', v.shopify_customer_id is not null
  );
end;
$$;

-- Como en 20261004214623_importacion_clientes.sql; además devuelve
--   ignored   Customer de una persona convertida en empresa (no se importa)
create or replace function public.import_shopify_customer(
  p_customer_id text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_note text,
  p_fallback_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_id uuid;
  v_rows integer;
begin
  if p_customer_id is null or p_customer_id !~ '^gid://shopify/Customer/\d+$' then
    raise exception 'Id de cliente de Shopify inválido: %', p_customer_id
      using errcode = '22023';
  end if;
  -- Customer de una persona que se convirtió en empresa y no quedó de contacto.
  if exists (
    select 1 from public.unlinked_shopify_customers where shopify_customer_id = p_customer_id
  ) then
    return 'ignored';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    v_email := null;
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9]\d{6,14}$' then
    v_phone := null;
  end if;
  if length(v_first) > 100 or length(v_last) > 100 then
    v_first := left(v_first, 100);
    v_last := left(v_last, 100);
  end if;

  perform set_config('app.sync_origin', 'shopify', true);

  -- Contacto de una empresa: se actualiza el contacto, no se crea una persona.
  if exists (select 1 from public.contacts where shopify_customer_id = p_customer_id) then
    update public.contacts
    set first_name = case when v_first <> '' then v_first else first_name end,
        last_name = case when v_first <> '' then v_last else last_name end,
        email = coalesce(v_email, email),
        phone = coalesce(v_phone, phone)
    where shopify_customer_id = p_customer_id;
    perform set_config('app.sync_origin', '', true);
    return 'contact';
  end if;

  select id into v_id from public.clients where shopify_customer_id = p_customer_id;
  if v_id is not null then
    -- Sin nombres en Shopify se conservan los del sistema.
    update public.clients
    set first_name = case when v_first <> '' then v_first else first_name end,
        last_name = case when v_first <> '' then v_last else last_name end,
        email = coalesce(v_email, email),
        phone = coalesce(v_phone, phone)
    where id = v_id
      and (first_name, last_name, email, phone) is distinct from (
        case when v_first <> '' then v_first else first_name end,
        case when v_first <> '' then v_last else last_name end,
        coalesce(v_email, email),
        coalesce(v_phone, phone)
      );
    get diagnostics v_rows = row_count;
    perform set_config('app.sync_origin', '', true);
    return case when v_rows > 0 then 'updated' else 'unchanged' end;
  end if;

  -- Una persona registrada en el sistema que aún no está vinculada: se vincula (su
  -- alta pendiente, si la hay, verá el id y no creará otro cliente en Shopify).
  select id into v_id from public.clients
  where kind = 'persona' and shopify_customer_id is null
    and ((v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))
  order by created_at, id
  limit 1;
  if v_id is not null then
    update public.clients set shopify_customer_id = p_customer_id where id = v_id;
    perform set_config('app.sync_origin', '', true);
    return 'linked';
  end if;

  insert into public.clients (kind, first_name, last_name, email, phone, notes, shopify_customer_id)
  values (
    'persona',
    case when v_first <> '' then v_first
         else coalesce(nullif(left(trim(coalesce(p_fallback_name, '')), 100), ''), 'Cliente de Shopify') end,
    case when v_first <> '' then v_last else '' end,
    v_email,
    v_phone,
    left(trim(coalesce(p_note, '')), 2000),
    p_customer_id
  );
  perform set_config('app.sync_origin', '', true);
  return 'created';
end;
$$;

