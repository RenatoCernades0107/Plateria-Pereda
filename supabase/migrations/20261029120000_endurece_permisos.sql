-- Paso 15.1: permisos mínimos (la matriz completa está en tests/60_matriz_permisos).
--
-- `profiles` conservaba los privilegios que Supabase da por defecto a toda tabla nueva:
-- anon y authenticated podían hacer TRUNCATE (que no pasa por RLS), INSERT y editar
-- cualquier columna. RLS ya filtraba las filas, pero los privilegios quedan al mínimo:
-- leer, borrar (RLS: solo el admin y nunca a sí mismo) y editar nombre, rol y estado.
revoke all on public.profiles from anon, authenticated;
grant select, delete on public.profiles to authenticated;
grant update (full_name, role, active) on public.profiles to authenticated;

-- Las secuencias públicas también conservaban el USAGE por defecto para anon.
revoke all on all sequences in schema public from anon;

-- Lo que se cree desde ahora en `public` no nace abierto para anon: cada migración
-- concede de forma explícita lo que necesita cada rol.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
