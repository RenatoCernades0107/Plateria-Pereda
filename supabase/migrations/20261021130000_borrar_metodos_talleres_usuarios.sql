-- Borrar métodos de pago, talleres y usuarios (pedido del 2026-10-21), como los materiales
-- y servicios (20261016130000):
--   * Solo el admin borra, y solo lo que nadie usa. Si está en uso (aunque esté
--     desactivado) un trigger BEFORE DELETE lo rechaza con un aviso que dice cuántos
--     registros lo usan y sugiere desactivarlo, así no se pierde el historial. El trigger
--     también aplica al service role (p. ej., auth.admin.deleteUser, que borra el perfil
--     en cascada).
--   * Métodos de pago: en uso si algún pago lo tiene.
--   * Talleres: en uso si alguna pieza lo tiene o lo tuvo (su historial de estados).
--   * Usuarios: solo se borra quien no registró nada (restauraciones, piezas, movimientos,
--     pagos, archivos, clientes, contactos, cotizaciones ni cambios en la auditoría). El
--     admin no se borra a sí mismo y nunca se borra al último admin activo. La app borra
--     primero el perfil (queda en la auditoría con quien lo hizo) y luego el usuario de
--     Supabase Auth.
--   * Cada borrado queda en la auditoría (las tres tablas ya están auditadas).

-- 0. "1 pago" / "3 pagos"; null si no hay ninguno.
create or replace function private.count_label(p_count bigint, p_singular text, p_plural text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_count = 1 then '1 ' || p_singular
    when p_count > 1 then p_count || ' ' || p_plural
  end;
$$;

-- "a", "a y b", "a, b y c".
create or replace function private.join_labels(p_labels text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when cardinality(p_labels) <= 1 then p_labels[1]
    else array_to_string(p_labels[1:cardinality(p_labels) - 1], ', ')
      || ' y ' || p_labels[cardinality(p_labels)]
  end;
$$;

revoke execute on function private.count_label(bigint, text, text) from public, anon, authenticated;
revoke execute on function private.join_labels(text[]) from public, anon, authenticated;

-- 1. Métodos de pago.
grant delete on public.payment_methods to authenticated;

create policy "Solo admin borra métodos de pago"
  on public.payment_methods for delete to authenticated
  using ((select private.has_role('{admin}')));

create or replace function private.block_payment_method_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payments bigint;
begin
  select count(*) into v_payments from public.payments where payment_method_id = old.id;
  if v_payments > 0 then
    raise exception '“%” está en uso en %. Desactívalo en su lugar.',
      old.name, private.count_label(v_payments, 'pago', 'pagos')
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function private.block_payment_method_delete_in_use() from public, anon, authenticated;

create trigger payment_methods_block_delete_in_use
  before delete on public.payment_methods
  for each row execute function private.block_payment_method_delete_in_use();

-- 2. Talleres. La FK de pieces.workshop_id es restrict y la del historial pone null: el
--    trigger avisa antes, contando cada pieza una vez (la tenga ahora o en su historial).
grant delete on public.workshops to authenticated;

create policy "Solo admin borra talleres"
  on public.workshops for delete to authenticated
  using ((select private.has_role('{admin}')));

create or replace function private.block_workshop_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pieces bigint;
begin
  select count(*) into v_pieces from (
    select p.id from public.pieces p where p.workshop_id = old.id
    union
    select h.piece_id from public.piece_status_history h where h.workshop_id = old.id
  ) used;
  if v_pieces > 0 then
    raise exception '“%” está en uso en %. Desactívalo en su lugar.',
      old.name, private.count_label(v_pieces, 'pieza', 'piezas')
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function private.block_workshop_delete_in_use() from public, anon, authenticated;

create trigger workshops_block_delete_in_use
  before delete on public.workshops
  for each row execute function private.block_workshop_delete_in_use();

-- 3. Usuarios. Lo que registró cada usuario (con FK a profiles o auth.users, o sin FK como
--    el historial de estados y la auditoría). La auditoría solo se nombra si no hay nada
--    más, porque cada registro anterior ya deja allí sus cambios.
create or replace function private.user_activity(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_labels text[];
  v_audit bigint;
begin
  select coalesce(array_agg(label order by ord) filter (where label is not null), '{}')
  into v_labels
  from (values
    (1, private.count_label(
      (select count(*) from public.restorations where created_by = p_user_id),
      'restauración', 'restauraciones')),
    (2, private.count_label(
      (select count(*) from public.pieces
        where created_by = p_user_id or returned_by = p_user_id),
      'pieza', 'piezas')),
    (3, private.count_label(
      (select count(*) from public.piece_status_history where actor_id = p_user_id),
      'cambio de estado de piezas', 'cambios de estado de piezas')),
    (4, private.count_label(
      (select count(*) from public.payments where created_by = p_user_id),
      'pago', 'pagos')),
    (5, private.count_label(
      (select count(*) from public.restoration_files where created_by = p_user_id),
      'archivo', 'archivos')),
    (6, private.count_label(
      (select count(*) from public.clients where created_by = p_user_id),
      'cliente', 'clientes')),
    (7, private.count_label(
      (select count(*) from public.contacts where created_by = p_user_id),
      'contacto', 'contactos')),
    (8, private.count_label(
      (select count(*) from public.quotes where created_by = p_user_id),
      'cotización', 'cotizaciones')),
    (9, private.count_label(
      (select count(*) from public.whatsapp_quotes where created_by = p_user_id),
      'cotización de WhatsApp', 'cotizaciones de WhatsApp'))
  ) as uses (ord, label);

  if cardinality(v_labels) = 0 then
    select count(*) into v_audit from public.audit_log where actor_id = p_user_id;
    if v_audit > 0 then
      v_labels := array[private.count_label(
        v_audit, 'cambio en la auditoría', 'cambios en la auditoría')];
    end if;
  end if;
  return v_labels;
end;
$$;

revoke execute on function private.user_activity(uuid) from public, anon, authenticated;

create or replace function private.block_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uses text[];
begin
  if old.role = 'admin' and old.active and not exists (
    select 1 from public.profiles p
    where p.role = 'admin' and p.active and p.id <> old.id
  ) then
    raise exception 'No se puede eliminar al último administrador activo.'
      using errcode = '23503';
  end if;

  v_uses := private.user_activity(old.id);
  if cardinality(v_uses) > 0 then
    raise exception '“%” tiene actividad en el sistema (%). Desactívalo en su lugar.',
      old.full_name, private.join_labels(v_uses)
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function private.block_profile_delete() from public, anon, authenticated;

create trigger profiles_block_delete
  before delete on public.profiles
  for each row execute function private.block_profile_delete();

-- El admin borra perfiles de otros (nunca el suyo); después la app borra el usuario de
-- Auth con la clave secreta.
grant delete on public.profiles to authenticated;

create policy "Solo admin borra a otros usuarios"
  on public.profiles for delete to authenticated
  using ((select private.has_role('{admin}')) and id <> (select auth.uid()));
