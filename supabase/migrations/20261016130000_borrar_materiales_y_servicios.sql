-- Borrar materiales y servicios del catálogo (pedido del 2026-10-16).
--   * El admin puede borrar un material o servicio, pero solo si ninguna pieza ni
--     cotización de WhatsApp lo usa; si está en uso se avisa y hay que desactivarlo, así
--     no se pierde el historial. Los métodos de pago siguen sin borrado.
--   * Materiales y servicios solo se crean desde Configuración: se quitan la RPC que los
--     creaba desde el formulario de la pieza y la creación a partir de un nombre escrito.

-- 1. Borrado: solo admin.
grant delete on public.materials, public.services to authenticated;

create policy "Solo admin borra materiales"
  on public.materials for delete to authenticated
  using ((select private.has_role('{admin}')));

create policy "Solo admin borra servicios"
  on public.services for delete to authenticated
  using ((select private.has_role('{admin}')));

-- 2. Un ítem en uso no se borra. Las FK de `material_id` y `service_id` solo ponen null
--    al borrar y `material_ids` es un arreglo sin FK, por eso el guard va en un trigger
--    (también aplica al service role).
create or replace function private.block_catalog_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pieces integer;
  v_quotes integer;
  v_uses text[] := '{}';
begin
  if tg_argv[0] = 'services' then
    select count(*) into v_pieces from public.pieces where service_id = old.id;
    select count(*) into v_quotes from public.whatsapp_quote_items where service_id = old.id;
  else
    select count(*) into v_pieces from public.pieces
      where material_id = old.id or old.id = any (material_ids);
    select count(*) into v_quotes from public.whatsapp_quote_items
      where material_id = old.id or old.id = any (material_ids);
  end if;

  if v_pieces > 0 then
    v_uses := v_uses || (v_pieces || case when v_pieces = 1 then ' pieza' else ' piezas' end);
  end if;
  if v_quotes > 0 then
    v_uses := v_uses || (v_quotes || case when v_quotes = 1
      then ' cotización de WhatsApp' else ' cotizaciones de WhatsApp' end);
  end if;
  if cardinality(v_uses) > 0 then
    raise exception '“%” está en uso en %. Desactívalo en su lugar.',
      old.name, array_to_string(v_uses, ' y ')
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function private.block_catalog_delete_in_use() from public, anon, authenticated;

create trigger materials_block_delete_in_use
  before delete on public.materials
  for each row execute function private.block_catalog_delete_in_use('materials');
create trigger services_block_delete_in_use
  before delete on public.services
  for each row execute function private.block_catalog_delete_in_use('services');

-- 3. Crear ítems solo desde Configuración. Un nombre escrito sin id (clientes antiguos)
--    ya no crea el ítem: se enlaza con uno activo que exista (sin distinguir mayúsculas
--    ni espacios de más) o se rechaza.
create or replace function private.link_piece_catalogs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_name text;
begin
  -- Servicio.
  if tg_op = 'UPDATE' and new.service_id is not null
     and new.service_id is not distinct from old.service_id then
    new.service_name := old.service_name;
  elsif new.service_id is not null then
    new.service_name := coalesce(
      (select s.name from public.services s where s.id = new.service_id), new.service_name
    );
  elsif trim(new.service_name) <> '' then
    v_name := regexp_replace(trim(new.service_name), '\s+', ' ', 'g');
    select s.id, s.name into new.service_id, new.service_name
    from public.services s
    where s.active and lower(trim(s.name)) = lower(v_name);
    if new.service_id is null then
      raise exception 'El servicio “%” no existe en el catálogo.', v_name using errcode = '23503';
    end if;
  end if;

  -- Materiales.
  if tg_op = 'INSERT' and cardinality(new.material_ids) = 0 then
    if new.material_id is not null then
      new.material_ids := array[new.material_id];
    elsif trim(new.material_name) <> '' then
      v_name := regexp_replace(trim(new.material_name), '\s+', ' ', 'g');
      select array[m.id] into new.material_ids
      from public.materials m
      where m.active and lower(trim(m.name)) = lower(v_name);
      if new.material_ids is null then
        raise exception 'El material “%” no existe en el catálogo.', v_name using errcode = '23503';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.material_ids is not distinct from old.material_ids then
    new.material_id := old.material_id;
    new.material_name := old.material_name;
    return new;
  end if;

  -- Sin repetidos, en el orden elegido.
  select coalesce(array_agg(u.id order by u.ord), '{}'::uuid[]) into v_ids
  from (
    select t.id, min(t.ord) as ord
    from unnest(new.material_ids) with ordinality as t(id, ord)
    where t.id is not null
    group by t.id
  ) u;
  if exists (
    select 1 from unnest(v_ids) as t(id)
    where not exists (select 1 from public.materials m where m.id = t.id)
  ) then
    raise exception 'Uno de los materiales no existe' using errcode = '23503';
  end if;

  new.material_ids := v_ids;
  new.material_id := v_ids[1];
  new.material_name := coalesce((
    select string_agg(m.name, ', ' order by t.ord)
    from unnest(v_ids) with ordinality as t(id, ord)
    join public.materials m on m.id = t.id
  ), '');
  return new;
end;
$$;

-- Ya nadie las usa: la creación al vuelo desde la pieza se quita.
drop function public.create_catalog_option(text, text);
drop function private.ensure_catalog_item(text, text);
