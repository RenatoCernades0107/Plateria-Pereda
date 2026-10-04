-- Edición de clientes y contactos sincronizada con Shopify en ambos sentidos (P16) y
-- listado con filtros (Pasos 6.4 y 6.5).

-- Encola una actualización hacia Shopify. Si ya hay una pendiente para el mismo
-- registro no se repite: el handler lee los datos vigentes al procesarla. Una que ya
-- se está procesando sí deja encolar otra, porque pudo leer los datos anteriores.
create or replace function private.enqueue_shopify_update(
  p_kind text,
  p_entity_table text,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shopify_sync_jobs
    where kind = p_kind and entity_table = p_entity_table and entity_id = p_entity_id
      and status = 'pending'
  ) then
    perform private.enqueue_shopify_job(p_kind, p_entity_table, p_entity_id);
  end if;
end;
$$;

revoke execute on function private.enqueue_shopify_update(text, text, text)
  from public, anon, authenticated;

-- Cambio que llega desde Shopify (webhook): no se devuelve a Shopify.
create or replace function private.change_from_shopify()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.sync_origin', true), '') = 'shopify';
$$;

create or replace function private.enqueue_client_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.change_from_shopify() then
    return null;
  end if;
  if new.kind = 'persona' and new.shopify_customer_id is not null and (
    new.first_name, new.last_name, new.email, new.phone
  ) is distinct from (old.first_name, old.last_name, old.email, old.phone) then
    perform private.enqueue_shopify_update('customer.update', 'clients', new.id::text);
  elsif new.kind = 'empresa' and new.shopify_company_id is not null and (
    new.legal_name, new.document_number, new.phone, new.address, new.city, new.region
  ) is distinct from (
    old.legal_name, old.document_number, old.phone, old.address, old.city, old.region
  ) then
    perform private.enqueue_shopify_update('company.update', 'clients', new.id::text);
  end if;
  return null;
end;
$$;

create or replace function private.enqueue_contact_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.change_from_shopify() then
    return null;
  end if;
  if new.shopify_customer_id is not null and (
    new.first_name, new.last_name, new.email, new.phone
  ) is distinct from (old.first_name, old.last_name, old.email, old.phone) then
    perform private.enqueue_shopify_update('contact.update', 'contacts', new.id::text);
  end if;
  return null;
end;
$$;

revoke execute on function private.enqueue_client_update() from public, anon, authenticated;
revoke execute on function private.enqueue_contact_update() from public, anon, authenticated;

create trigger clients_enqueue_update
  after update on public.clients
  for each row execute function private.enqueue_client_update();

create trigger contacts_enqueue_update
  after update on public.contacts
  for each row execute function private.enqueue_contact_update();

-- Aplica un cambio de un cliente hecho en Shopify (webhook customers/update) a la
-- persona o contacto vinculado, sin volver a encolarlo. Conserva los valores locales
-- que Shopify deja vacíos o que no cumplen las reglas del sistema. Devuelve cuántos
-- registros cambió.
create or replace function public.apply_shopify_customer_update(
  p_customer_id text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last text := trim(coalesce(p_last_name, ''));
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_changed integer := 0;
  v_rows integer;
begin
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    v_email := null;
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9]\d{6,14}$' then
    v_phone := null;
  end if;
  if v_first is not null and length(v_first) > 100 then
    v_first := null;
  end if;
  if length(v_last) > 100 then
    v_last := null;
  end if;

  perform set_config('app.sync_origin', 'shopify', true);

  update public.clients
  set first_name = coalesce(v_first, first_name),
      last_name = coalesce(v_last, last_name),
      email = coalesce(v_email, email),
      phone = coalesce(v_phone, phone)
  where shopify_customer_id = p_customer_id and kind = 'persona'
    and (first_name, last_name, email, phone) is distinct from (
      coalesce(v_first, first_name), coalesce(v_last, last_name),
      coalesce(v_email, email), coalesce(v_phone, phone)
    );
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  update public.contacts
  set first_name = coalesce(v_first, first_name),
      last_name = coalesce(v_last, last_name),
      email = coalesce(v_email, email),
      phone = coalesce(v_phone, phone)
  where shopify_customer_id = p_customer_id
    and (first_name, last_name, email, phone) is distinct from (
      coalesce(v_first, first_name), coalesce(v_last, last_name),
      coalesce(v_email, email), coalesce(v_phone, phone)
    );
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  perform set_config('app.sync_origin', '', true);
  return v_changed;
end;
$$;

revoke execute on function public.apply_shopify_customer_update(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_shopify_customer_update(text, text, text, text, text)
  to service_role;

-- Listado de clientes con búsqueda, filtros y estado de sincronización (el último job
-- del cliente; sin jobs pero con id de Shopify = importado, cuenta como sincronizado).
create or replace function public.list_clients(
  p_query text default null,
  p_kind public.client_kind default null,
  p_sync text default null,
  p_active boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind public.client_kind,
  display_name text,
  document_type public.document_type,
  document_number text,
  phone text,
  email text,
  active boolean,
  job_id bigint,
  sync_status text,
  last_error text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select c.id, c.kind, c.display_name, c.document_type, c.document_number, c.phone,
      c.email, c.active, c.created_at, j.id as job_id, j.last_error,
      case
        when j.status is not null then j.status
        when coalesce(c.shopify_customer_id, c.shopify_company_id) is not null then 'ok'
      end as sync_status
    from public.clients c
    left join lateral (
      select sj.id, sj.status, sj.last_error
      from public.shopify_sync_jobs sj
      where sj.entity_table = 'clients' and sj.entity_id = c.id::text
      order by sj.created_at desc, sj.id desc
      limit 1
    ) j on true
    where (select private.current_app_role()) is not null
      and (p_kind is null or c.kind = p_kind)
      and (p_active is null or c.active = p_active)
      and (
        nullif(trim(p_query), '') is null
        or c.display_name ilike '%' || trim(p_query) || '%'
        or c.document_number ilike '%' || trim(p_query) || '%'
        or c.email ilike '%' || trim(p_query) || '%'
        or (
          length(regexp_replace(p_query, '\D', '', 'g')) >= 3
          and c.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
        )
      )
  )
  select f.id, f.kind, f.display_name, f.document_type, f.document_number, f.phone,
    f.email, f.active, f.job_id, f.sync_status, f.last_error, count(*) over ()
  from filtered f
  where p_sync is null
    or (p_sync = 'ok' and f.sync_status = 'ok')
    or (p_sync = 'pending' and f.sync_status in ('pending', 'processing'))
    or (p_sync = 'error' and f.sync_status = 'error')
  order by f.created_at desc, f.id
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_clients(text, public.client_kind, text, boolean, integer, integer)
  from public, anon;
grant execute on function public.list_clients(text, public.client_kind, text, boolean, integer, integer)
  to authenticated;
