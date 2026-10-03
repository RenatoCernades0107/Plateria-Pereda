-- Copia del email de cada usuario en su perfil, para listarlos sin consultar la API de Auth.

alter table public.profiles add column email text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email, 'Usuario'),
    new.email,
    coalesce(
      (select r from unnest(enum_range(null::public.app_role)) as r
        where r::text = new.raw_app_meta_data ->> 'role'),
      'logistica'
    )
  );
  return new;
end;
$$;

create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function private.sync_profile_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function private.sync_profile_email();
