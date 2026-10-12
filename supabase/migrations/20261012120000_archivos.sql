-- Fotos y archivos de las restauraciones (Fase 10, P32 con su propuesta, P42).
--   * Bucket privado `restoration-files`: `restorations/{id}/general/{archivo}` (foto
--     general de todas las piezas) y `restorations/{id}/pieces/{id}/{archivo}`.
--   * JPG, PNG, WebP, HEIC y PDF; máximo 10 MB (las fotos se comprimen en el navegador).
--   * Clasificación Antes / Después / Documento / Otro; sin límite de cantidad.
--   * Suben admin, ventas y logística (logística, solo en restauraciones que aún ve,
--     D24); borran el admin y quien subió el archivo.
--   * Se ven con URLs firmadas de corta duración: la política de lectura del bucket
--     exige que el archivo esté registrado y que la restauración sea visible.

create type public.file_category as enum ('antes', 'despues', 'documento', 'otro');

create table public.restoration_files (
  id uuid primary key default gen_random_uuid(),
  restoration_id uuid not null references public.restorations (id) on delete cascade,
  -- Null: foto general de la restauración.
  piece_id uuid references public.pieces (id) on delete cascade,
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
  -- La ruta corresponde a la restauración y, si la hay, a la pieza.
  constraint restoration_files_path check (
    path like 'restorations/' || restoration_id::text || '/' || case
      when piece_id is null then 'general/%'
      else 'pieces/' || piece_id::text || '/%'
    end
  )
);

comment on table public.restoration_files is
  'Fotos y documentos de una restauración (general) o de una pieza. El archivo vive en el bucket restoration-files.';

create index restoration_files_restoration_idx on public.restoration_files (restoration_id, created_at);
create index restoration_files_piece_idx on public.restoration_files (piece_id) where piece_id is not null;

-- La pieza debe ser de la restauración; el nombre de quien subió se guarda al registrar.
create or replace function private.prepare_restoration_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.piece_id is not null and not exists (
    select 1 from public.pieces p where p.id = new.piece_id and p.restoration_id = new.restoration_id
  ) then
    raise exception 'La pieza no es de esta restauración' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  new.created_by_name := (select full_name from public.profiles where id = auth.uid());
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function private.prepare_restoration_file() from public, anon, authenticated;

create trigger restoration_files_prepare
  before insert on public.restoration_files
  for each row execute function private.prepare_restoration_file();

-- ¿Quien consulta ve esta restauración? Admin y ventas, todas; logística, las que no
-- son pasadas (D24, P48).
create or replace function private.can_see_restoration(p_restoration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.restorations r
    where r.id = p_restoration_id
      and (
        private.has_role('{admin,ventas}')
        or (private.has_role('{logistica}') and not private.is_past_restoration(r.id, r.status))
      )
  );
$$;

revoke execute on function private.can_see_restoration(uuid) from public, anon;
grant execute on function private.can_see_restoration(uuid) to authenticated;

alter table public.restoration_files enable row level security;

create policy "Quien ve la restauración ve sus archivos"
  on public.restoration_files for select
  to authenticated
  using ((select private.can_see_restoration(restoration_id)));

create policy "Quien ve la restauración sube archivos"
  on public.restoration_files for insert
  to authenticated
  with check ((select private.can_see_restoration(restoration_id)));

create policy "Borran el admin y quien subió el archivo"
  on public.restoration_files for delete
  to authenticated
  using (
    (select private.can_see_restoration(restoration_id))
    and ((select private.has_role('{admin}')) or created_by = (select auth.uid()))
  );

revoke all on public.restoration_files from anon, authenticated;
grant select, delete on public.restoration_files to authenticated;
grant insert (restoration_id, piece_id, path, name, mime_type, size_bytes, category)
  on public.restoration_files to authenticated;

select audit.enable('public.restoration_files');

-- Bucket privado. El tamaño y los tipos los valida también Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restoration-files', 'restoration-files', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
);

-- Restauración de una ruta `restorations/{id}/...` (null si no tiene esa forma).
create or replace function private.file_restoration_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if v_parts[1] <> 'restorations' or cardinality(v_parts) < 4
     or v_parts[3] not in ('general', 'pieces') then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke execute on function private.file_restoration_id(text) from public, anon;
grant execute on function private.file_restoration_id(text) to authenticated;

-- Quien lo subió ve también su objeto aún sin registrar (para poder borrarlo).
create policy "Se leen los archivos registrados de restauraciones visibles"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'restoration-files'
    and (
      exists (select 1 from public.restoration_files f where f.path = objects.name)
      or (
        owner_id = (select auth.uid())::text
        and not exists (select 1 from public.restoration_files f where f.path = objects.name)
      )
    )
  );

create policy "Quien ve la restauración sube sus archivos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restoration-files'
    and (select private.can_see_restoration(private.file_restoration_id(name)))
  );

-- También quien lo subió puede borrar un objeto que no llegó a registrarse (si falló
-- el registro después de la subida).
create policy "Borran el admin y quien subió el archivo (bucket)"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restoration-files'
    and (
      exists (
        select 1 from public.restoration_files f
        where f.path = objects.name
          and ((select private.has_role('{admin}')) or f.created_by = (select auth.uid()))
      )
      or (
        owner_id = (select auth.uid())::text
        and not exists (select 1 from public.restoration_files f where f.path = objects.name)
      )
    )
  );
