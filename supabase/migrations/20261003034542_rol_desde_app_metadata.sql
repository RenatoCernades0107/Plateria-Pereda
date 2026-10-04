-- La API de administración de Supabase crea el usuario y guarda app_metadata en un UPDATE
-- posterior, así que el trigger de INSERT no ve el rol. Este trigger lo aplica al perfil.

create or replace function private.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role public.app_role;
begin
  select r into new_role
  from unnest(enum_range(null::public.app_role)) as r
  where r::text = new.raw_app_meta_data ->> 'role';

  if new_role is not null
     and new.raw_app_meta_data ->> 'role' is distinct from old.raw_app_meta_data ->> 'role' then
    update public.profiles set role = new_role where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function private.sync_profile_role() from public, anon, authenticated;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row execute function private.sync_profile_role();
