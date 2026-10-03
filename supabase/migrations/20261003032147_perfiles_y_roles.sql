-- Perfiles de usuario y roles de la aplicación.

create type public.app_role as enum ('admin', 'ventas', 'logistica');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Datos de cada usuario del sistema: nombre, rol y si puede ingresar.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Al crear un usuario en Supabase Auth se crea su perfil. El rol viene de app_metadata,
-- que solo puede escribir el servidor; sin rol se usa logística (el de menos acceso).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email, 'Usuario'),
    coalesce(
      (select r from unnest(enum_range(null::public.app_role)) as r
        where r::text = new.raw_app_meta_data ->> 'role'),
      'logistica'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Rol del usuario autenticado, o null si no tiene perfil o está desactivado.
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and active;
$$;

create or replace function private.has_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (roles), false);
$$;

-- Las políticas RLS llaman a estas funciones con el rol del usuario.
grant usage on schema private to authenticated;
revoke execute on function private.current_app_role() from public, anon;
revoke execute on function private.has_role(public.app_role[]) from public, anon;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;

alter table public.profiles enable row level security;

create policy "Cada usuario lee su perfil; admin lee todos"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.has_role('{admin}')));

create policy "Solo admin edita perfiles"
  on public.profiles for update
  to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));
