-- Extensiones y utilidades compartidas por todas las tablas.

-- Búsqueda por similitud (nombres, documentos, teléfonos).
create extension if not exists pg_trgm with schema extensions;

-- Funciones internas: este esquema no se expone por la API de Supabase.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'Trigger BEFORE UPDATE: actualiza la columna updated_at con la fecha y hora actual.';
