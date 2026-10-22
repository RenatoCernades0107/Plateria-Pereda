-- Cotizaciones de WhatsApp con fotos y con su propio mensaje (pedido del 2026-10-21).
--   * `settings.whatsapp_quote_template`: plantilla del mensaje de las cotizaciones de
--     WhatsApp, aparte de la de las guías (null: la de la aplicación).
--   * `whatsapp_quote_files`: fotos y archivos de la cotización, con el mismo formato
--     que los de las restauraciones (general o por pieza, Antes / Después / Documento /
--     Otro). Viven en el bucket `restoration-files` bajo `whatsapp-quotes/{id}/...`.
--     Al crear una restauración desde la cotización se copian a la guía (lo hace la
--     aplicación con la API de Storage); la cotización conserva las suyas.
--   * Editar la cotización conserva el id de cada pieza (antes se borraban y se
--     volvían a crear), así sus fotos siguen con ella. Las fotos de una pieza quitada
--     pasan a ser fotos generales de la cotización.
--   * Solo admin y ventas (como las cotizaciones de WhatsApp).

alter table public.settings
  add column whatsapp_quote_template text check (length(whatsapp_quote_template) <= 4000);

create table public.whatsapp_quote_files (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.whatsapp_quotes (id) on delete cascade,
  -- Null: foto general de la cotización. Se comprueba al final de la transacción:
  -- al editar, la pieza se borra y se vuelve a crear con el mismo id.
  item_id uuid references public.whatsapp_quote_items (id) deferrable initially deferred,
  path text not null unique check (length(path) <= 500),
  name text not null check (length(name) between 1 and 255),
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  category public.file_category not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  -- La ruta es de la cotización (la pieza puede cambiar a general si se quita).
  constraint whatsapp_quote_files_path check (
    path like 'whatsapp-quotes/' || quote_id::text || '/%'
  )
);

comment on table public.whatsapp_quote_files is
  'Fotos y documentos de una cotización de WhatsApp (general) o de una de sus piezas. El archivo vive en el bucket restoration-files.';

create index whatsapp_quote_files_quote_idx on public.whatsapp_quote_files (quote_id, created_at);
create index whatsapp_quote_files_item_idx on public.whatsapp_quote_files (item_id) where item_id is not null;

-- La pieza debe ser de la cotización; el nombre de quien subió se guarda al registrar.
create or replace function private.prepare_whatsapp_quote_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_id is not null and not exists (
    select 1 from public.whatsapp_quote_items i where i.id = new.item_id and i.quote_id = new.quote_id
  ) then
    raise exception 'La pieza no es de esta cotización' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  new.created_by_name := (select full_name from public.profiles where id = auth.uid());
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function private.prepare_whatsapp_quote_file() from public, anon, authenticated;

create trigger whatsapp_quote_files_prepare
  before insert on public.whatsapp_quote_files
  for each row execute function private.prepare_whatsapp_quote_file();

alter table public.whatsapp_quote_files enable row level security;

create policy "Admin y ventas ven los archivos de las cotizaciones de WhatsApp"
  on public.whatsapp_quote_files for select
  to authenticated
  using ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas suben archivos a las cotizaciones de WhatsApp"
  on public.whatsapp_quote_files for insert
  to authenticated
  with check ((select private.has_role('{admin,ventas}')));

create policy "Borran el admin y quien subió el archivo de la cotización"
  on public.whatsapp_quote_files for delete
  to authenticated
  using (
    (select private.has_role('{admin,ventas}'))
    and ((select private.has_role('{admin}')) or created_by = (select auth.uid()))
  );

revoke all on public.whatsapp_quote_files from anon, authenticated;
grant select, delete on public.whatsapp_quote_files to authenticated;
grant insert (quote_id, item_id, path, name, mime_type, size_bytes, category)
  on public.whatsapp_quote_files to authenticated;

select audit.enable('public.whatsapp_quote_files');

-- Cotización de una ruta `whatsapp-quotes/{id}/...` (null si no tiene esa forma).
create or replace function private.file_whatsapp_quote_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if v_parts[1] <> 'whatsapp-quotes' or cardinality(v_parts) < 4
     or v_parts[3] not in ('general', 'items') then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke execute on function private.file_whatsapp_quote_id(text) from public, anon;
grant execute on function private.file_whatsapp_quote_id(text) to authenticated;

-- Bucket: se suman a las políticas de las restauraciones (se combinan con OR).
create policy "Se leen los archivos registrados de cotizaciones de WhatsApp"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'restoration-files'
    and (select private.has_role('{admin,ventas}'))
    and exists (select 1 from public.whatsapp_quote_files f where f.path = objects.name)
  );

create policy "Admin y ventas suben archivos de cotizaciones de WhatsApp"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restoration-files'
    and (select private.has_role('{admin,ventas}'))
    and exists (
      select 1 from public.whatsapp_quotes q
      where q.id = private.file_whatsapp_quote_id(name)
    )
  );

create policy "Borran el admin y quien subió el archivo de la cotización (bucket)"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restoration-files'
    and exists (
      select 1 from public.whatsapp_quote_files f
      where f.path = objects.name
        and (select private.has_role('{admin,ventas}'))
        and ((select private.has_role('{admin}')) or f.created_by = (select auth.uid()))
    )
  );

-- Las piezas conservan su id al editar: `p_keep_ids` usa el `quote_item_id` de cada
-- pieza (ya comprobado por update_whatsapp_quote).
drop function private.insert_whatsapp_quote_items(uuid, jsonb);

create or replace function private.insert_whatsapp_quote_items(
  p_quote_id uuid,
  p_items jsonb,
  p_keep_ids boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_number integer := 0;
begin
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    v_number := v_number + 1;
    insert into public.whatsapp_quote_items (
      id, quote_id, number, description, measure, material_id, material_name, material_ids,
      service_id, service_name, service_ids, weight_grams, price, notes, quantity
    ) values (
      case
        when p_keep_ids then coalesce(nullif(v_item ->> 'quote_item_id', '')::uuid, gen_random_uuid())
        else gen_random_uuid()
      end,
      p_quote_id,
      v_number,
      trim(coalesce(v_item ->> 'description', '')),
      trim(coalesce(v_item ->> 'measure', '')),
      nullif(v_item ->> 'material_id', '')::uuid,
      trim(coalesce(v_item ->> 'material_name', '')),
      private.uuid_array(v_item -> 'material_ids'),
      nullif(v_item ->> 'service_id', '')::uuid,
      trim(coalesce(v_item ->> 'service_name', '')),
      private.uuid_array(v_item -> 'service_ids'),
      nullif(v_item ->> 'weight_grams', '')::numeric,
      (v_item ->> 'price')::numeric,
      coalesce(v_item ->> 'notes', ''),
      private.piece_quantity(v_item -> 'quantity')
    );
  end loop;
end;
$$;

revoke execute on function private.insert_whatsapp_quote_items(uuid, jsonb, boolean) from public, anon, authenticated;

create or replace function public.update_whatsapp_quote(p_id uuid, p_client_id uuid, p_contact_id uuid, p_customer_name text, p_customer_phone text, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote public.whatsapp_quotes;
  v_keep uuid[];
begin
  perform private.check_whatsapp_quote_input(p_client_id, p_contact_id, p_items);
  select * into v_quote from public.whatsapp_quotes q where q.id = p_id for update;
  if v_quote.id is null then
    raise exception 'La cotización no existe' using errcode = '23503';
  end if;
  if v_quote.status = 'descartada' then
    raise exception 'Una cotización descartada no se edita; reábrela primero' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pieces p join public.whatsapp_quote_items i on i.id = p.whatsapp_quote_item_id
    where i.quote_id = p_id
  ) then
    raise exception 'La cotización ya se pasó a una restauración: no se edita' using errcode = '23514';
  end if;

  -- Piezas que siguen (con su id): deben ser de esta cotización y no repetirse.
  select coalesce(array_agg((i ->> 'quote_item_id')::uuid), '{}'::uuid[]) into v_keep
  from jsonb_array_elements(p_items) i
  where nullif(i ->> 'quote_item_id', '') is not null;
  if cardinality(v_keep) <> (select count(distinct k) from unnest(v_keep) k) then
    raise exception 'Una pieza cotizada se repite.' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(v_keep) k
    where not exists (select 1 from public.whatsapp_quote_items i where i.id = k and i.quote_id = p_id)
  ) then
    raise exception 'La pieza no es de esta cotización.' using errcode = '23514';
  end if;

  update public.whatsapp_quotes q set
    client_id = p_client_id,
    contact_id = case when p_client_id is not null then p_contact_id end,
    customer_name = case when p_client_id is null then trim(coalesce(p_customer_name, '')) else '' end,
    customer_phone = case when p_client_id is null then trim(coalesce(p_customer_phone, '')) else '' end,
    payment_type = p_payment_type,
    deposit_percent = case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    notes = coalesce(p_notes, '')
  where q.id = p_id;
  -- Las fotos de las piezas quitadas quedan como fotos generales.
  update public.whatsapp_quote_files f set item_id = null
  where f.quote_id = p_id and f.item_id is not null and not (f.item_id = any (v_keep));
  delete from public.whatsapp_quote_items i where i.quote_id = p_id;
  perform private.insert_whatsapp_quote_items(p_id, p_items, true);
end;
$function$;

revoke execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb) from public, anon;
grant execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb) to authenticated, service_role;

-- El listado se ordena como el de las restauraciones: por fecha (por defecto, las más
-- recientes primero), código, cliente o total.
drop function public.list_whatsapp_quotes(text, public.whatsapp_quote_status, uuid, date, date, integer, integer);

create or replace function public.list_whatsapp_quotes(
  p_query text default null,
  p_status public.whatsapp_quote_status default null,
  p_client_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'created_at',
  p_dir text default 'desc'
)
returns table (
  id uuid,
  code text,
  client_id uuid,
  client_name text,
  contact_name text,
  customer_name text,
  customer_phone text,
  status public.whatsapp_quote_status,
  items_count integer,
  pending_count integer,
  total numeric,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select q.*, c.display_name as client_name, k.display_name as contact_name,
      (select count(*)::integer from public.whatsapp_quote_items i where i.quote_id = q.id) as items_count,
      private.whatsapp_quote_ordered_count(q.id) as ordered_count
    from public.whatsapp_quotes q
    left join public.clients c on c.id = q.client_id
    left join public.contacts k on k.id = q.contact_id
    where (select private.has_role('{admin,ventas}'))
      and (p_status is null or q.status = p_status)
      and (p_client_id is null or q.client_id = p_client_id)
      and (p_from is null or (q.created_at at time zone 'America/Lima')::date >= p_from)
      and (p_to is null or (q.created_at at time zone 'America/Lima')::date <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or q.code ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
        or k.display_name ilike '%' || trim(p_query) || '%'
        or q.customer_name ilike '%' || trim(p_query) || '%'
        or q.customer_phone ilike '%' || trim(p_query) || '%'
        or exists (
          select 1 from public.whatsapp_quote_items i
          where i.quote_id = q.id and i.description ilike '%' || trim(p_query) || '%'
        )
      )
  )
  select f.id, f.code, f.client_id, f.client_name, f.contact_name, f.customer_name, f.customer_phone,
    f.status, f.items_count, f.items_count - f.ordered_count, f.total, f.created_at, count(*) over ()
  from filtered f
  order by
    case when p_sort = 'code' and p_dir = 'asc' then f.code end asc,
    case when p_sort = 'code' and p_dir <> 'asc' then f.code end desc,
    case when p_sort = 'client' and p_dir = 'asc'
      then lower(coalesce(nullif(f.client_name, ''), f.customer_name)) end asc nulls last,
    case when p_sort = 'client' and p_dir <> 'asc'
      then lower(coalesce(nullif(f.client_name, ''), f.customer_name)) end desc nulls last,
    case when p_sort = 'total' and p_dir = 'asc' then f.total end asc,
    case when p_sort = 'total' and p_dir <> 'asc' then f.total end desc,
    case when p_dir = 'asc' then f.created_at end asc,
    f.created_at desc,
    f.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_whatsapp_quotes(text, public.whatsapp_quote_status, uuid, date, date, integer, integer, text, text)
  from public, anon;
grant execute on function public.list_whatsapp_quotes(text, public.whatsapp_quote_status, uuid, date, date, integer, integer, text, text)
  to authenticated;
