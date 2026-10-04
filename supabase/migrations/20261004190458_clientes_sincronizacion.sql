-- Sincronización de clientes y contactos con Shopify (Paso 6.2).

-- La ubicación de una Company en Shopify necesita ciudad y región (Perú exige la región,
-- spike 4.1). Región = código de Shopify, p. ej. LIM.
alter table public.clients
  add column city text not null default '' check (length(city) <= 100),
  add column region text check (region ~ '^[A-Z]{3}$');

-- Al registrar un cliente o contacto se encola su alta en Shopify, en la misma
-- transacción. Los que ya traen su id de Shopify (importados) no se encolan.
create or replace function private.enqueue_client_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'persona' and new.shopify_customer_id is null then
    perform private.enqueue_shopify_job('customer.create', 'clients', new.id::text, '{}', 'client:' || new.id);
  elsif new.kind = 'empresa' and new.shopify_company_id is null then
    perform private.enqueue_shopify_job('company.create', 'clients', new.id::text, '{}', 'client:' || new.id);
  end if;
  return null;
end;
$$;

create or replace function private.enqueue_contact_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shopify_company_contact_id is null then
    perform private.enqueue_shopify_job('contact.create', 'contacts', new.id::text, '{}', 'contact:' || new.id);
  end if;
  return null;
end;
$$;

revoke execute on function private.enqueue_client_sync() from public, anon, authenticated;
revoke execute on function private.enqueue_contact_sync() from public, anon, authenticated;

create trigger clients_enqueue_sync
  after insert on public.clients
  for each row execute function private.enqueue_client_sync();

create trigger contacts_enqueue_sync
  after insert on public.contacts
  for each row execute function private.enqueue_contact_sync();

-- Estado de sincronización de varios registros (el último job de cada uno). El outbox
-- solo lo lee el admin; esta función expone solo el estado a cualquier usuario activo.
create or replace function public.shopify_sync_status(p_entity_table text, p_entity_ids text[])
returns table (entity_id text, job_id bigint, status text, last_error text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (j.entity_id) j.entity_id, j.id, j.status, j.last_error
  from public.shopify_sync_jobs j
  where (select private.current_app_role()) is not null
    and j.entity_table = p_entity_table
    and j.entity_id = any (p_entity_ids)
  order by j.entity_id, j.created_at desc, j.id desc;
$$;

revoke execute on function public.shopify_sync_status(text, text[]) from public, anon;
grant execute on function public.shopify_sync_status(text, text[]) to authenticated;
