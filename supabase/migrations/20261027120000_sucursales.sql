-- Sucursal de cada pago (pedido del 2026-10-27). La API de Shopify no deja asignar el
-- "Employee" del pedido, así que al registrar un pago se elige la sucursal que lo cobró
-- y su pedido la lleva como etiqueta (su nombre, p. ej. "PEREDA 4TA - CAJA"), visible
-- en la columna «Etiquetas» de la lista de pedidos. Shopify limita cada etiqueta a 40
-- caracteres y las separa por comas: el nombre tiene máximo 40 y no lleva comas. Las sucursales son un catálogo que el admin gestiona
-- en Configuración, igual que los métodos de pago: se borran mientras ningún pago las
-- use; si no, se desactivan.

-- 1. Catálogo.
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40 and position(',' in name) = 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.branches is
  'Sucursales que cobran los pagos; su nombre va como etiqueta del pedido de Shopify.';

create unique index branches_name_key on public.branches (lower(trim(name)));

create trigger branches_set_updated_at before update on public.branches
  for each row execute function private.set_updated_at();

insert into public.branches (name) values
  ('RUS CARMEN - VENTAS2'),
  ('PEREDA SAC - VENTAS1'),
  ('RUS REGINA - LOGISTICA'),
  ('RUS ANDREA - MKT'),
  ('PEREDA 4TA - CAJA');

select audit.enable('public.branches');

revoke all on public.branches from anon, authenticated;
grant select, insert, update, delete on public.branches to authenticated;

alter table public.branches enable row level security;

-- Como los métodos de pago: solo admin y ventas (logística no ve pagos, P42).
create policy "Admin y ventas leen las sucursales"
  on public.branches for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Solo admin crea sucursales"
  on public.branches for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "Solo admin edita sucursales"
  on public.branches for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));
create policy "Solo admin borra sucursales"
  on public.branches for delete to authenticated
  using ((select private.has_role('{admin}')));

create or replace function private.block_branch_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payments bigint;
begin
  select count(*) into v_payments from public.payments where branch_id = old.id;
  if v_payments > 0 then
    raise exception '“%” está en uso en %. Desactívala en su lugar.',
      old.name, private.count_label(v_payments, 'pago', 'pagos')
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function private.block_branch_delete_in_use() from public, anon, authenticated;

create trigger branches_block_delete_in_use
  before delete on public.branches
  for each row execute function private.block_branch_delete_in_use();

-- 2. Sucursal del pago: la elegida y su nombre al registrarlo (como el método). Queda
--    vacía en los pagos anteriores, en los importados de Shopify y en los reembolsos.
alter table public.payments
  add column branch_id uuid references public.branches (id),
  add column branch_name text;

comment on column public.payments.branch_id is 'Sucursal que cobró el pago.';
comment on column public.payments.branch_name is
  'Nombre de la sucursal al registrar el pago; va como etiqueta del pedido.';

create index payments_branch_idx on public.payments (branch_id);

grant insert (branch_id) on public.payments to authenticated;

create or replace function private.set_payment_branch_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.branch_name := (select name from public.branches where id = new.branch_id);
  return new;
end;
$$;

revoke execute on function private.set_payment_branch_name() from public, anon, authenticated;

create trigger payments_branch_name
  before insert on public.payments
  for each row execute function private.set_payment_branch_name();
