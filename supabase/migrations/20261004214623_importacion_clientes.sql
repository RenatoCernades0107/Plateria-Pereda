-- Importación de clientes de Shopify (Paso 6.6). Idempotente por shopify_customer_id:
-- volver a importar actualiza en vez de duplicar, y nada de lo importado se devuelve a
-- Shopify (app.sync_origin = 'shopify', ver 20261004203436_clientes_edicion.sql).
--
-- Recibe los datos ya normalizados por la aplicación (`personFromShopify`): nombres y
-- apellidos tal como están en Shopify, email y teléfono válidos o null, y el nombre a
-- usar si Shopify no tiene nombres. Devuelve qué hizo:
--   created   persona nueva
--   linked    persona del sistema sin id de Shopify con el mismo email o teléfono
--   updated   ya importada, con datos distintos
--   unchanged ya importada, sin cambios
--   contact   es el Customer de un contacto de empresa (se actualiza el contacto)
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

revoke execute on function public.import_shopify_customer(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.import_shopify_customer(text, text, text, text, text, text, text)
  to service_role;
