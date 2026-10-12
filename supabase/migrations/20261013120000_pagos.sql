-- Registro de pagos y estado de pago (Paso 11.1, §7.5, P28 y P29 respondidas el 2026-10-12).
--   * `payments` es el registro del sistema: pagos y reembolsos, con método, fecha y
--     quién lo registró. Un pago no se edita ni se borra: si hubo un error, el admin
--     lo corrige con un reembolso con motivo.
--   * Los pagos hechos en Shopify (POS o panel, 11.3) entran con `source = 'shopify'`
--     y su id de transacción, único, para no duplicarlos.
--   * Pagado = pagos − reembolsos. Estado (P29): Pendiente (nada pagado), Parcial,
--     Pagado (pagado ≥ total, con total > 0) y Reembolsado (se devolvió todo lo que se
--     había pagado). Igual que derivePaymentStatus() de src/domain/payments.ts.
--   * El tipo de pago solo se cambia mientras no haya pagos registrados (P28).
--   * Logística no ve pagos (P42); registran admin y ventas; reembolsos, solo el admin.

create type public.payment_kind as enum ('pago', 'reembolso');
create type public.payment_source as enum ('sistema', 'shopify');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restoration_id uuid not null references public.restorations (id) on delete restrict,
  kind public.payment_kind not null default 'pago',
  amount numeric(12, 2) not null check (amount > 0),
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  -- Nombre del método al registrarlo (o la pasarela de Shopify).
  method_name text not null check (length(trim(method_name)) between 1 and 100),
  paid_on date not null default (now() at time zone 'America/Lima')::date,
  -- Obligatorio en los reembolsos.
  reason text not null default '' check (length(reason) <= 500),
  source public.payment_source not null default 'sistema',
  shopify_transaction_id text unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),

  constraint payments_refund_reason check (kind = 'pago' or length(trim(reason)) > 0),
  constraint payments_shopify_transaction check (
    source = 'sistema' or shopify_transaction_id is not null
  )
);

comment on table public.payments is
  'Pagos y reembolsos de una restauración (registro del sistema). Pagado = pagos − reembolsos.';

create index payments_restoration_idx on public.payments (restoration_id, created_at);

-- Estado de pago (P29). Con total 0 y nada pagado queda Pendiente.
create or replace function private.payment_status_for(
  p_total numeric, p_paid numeric, p_refunded numeric
)
returns public.payment_status
language sql
immutable
set search_path = ''
as $$
  select case
    when p_paid <= 0 and p_refunded > 0 then 'reembolsado'::public.payment_status
    when p_paid <= 0 then 'pendiente'::public.payment_status
    when p_paid >= p_total then 'pagado'::public.payment_status
    else 'parcial'::public.payment_status
  end;
$$;

revoke execute on function private.payment_status_for(numeric, numeric, numeric) from public, anon;
grant execute on function private.payment_status_for(numeric, numeric, numeric) to authenticated;

-- Valida el pago: el método, quién lo registra, que no pase del saldo y que el
-- reembolso no pase de lo pagado (los de Shopify se aceptan como vienen).
create or replace function private.prepare_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
  v_paid numeric;
  v_method text;
begin
  select balance, paid into v_balance, v_paid
  from public.restorations where id = new.restoration_id for update;

  if new.payment_method_id is not null then
    select name into v_method from public.payment_methods where id = new.payment_method_id;
    new.method_name := v_method;
  end if;

  if new.source = 'sistema' then
    if new.kind = 'pago' and new.amount > v_balance then
      raise exception 'El monto supera el saldo pendiente' using errcode = '23514';
    end if;
    if new.kind = 'reembolso' and new.amount > v_paid then
      raise exception 'El reembolso supera lo pagado' using errcode = '23514';
    end if;
  end if;

  new.created_by := auth.uid();
  new.created_by_name := (select full_name from public.profiles where id = auth.uid());
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function private.prepare_payment() from public, anon, authenticated;

create trigger payments_prepare
  before insert on public.payments
  for each row execute function private.prepare_payment();

-- Recalcula lo pagado de la restauración (el estado lo fija el trigger de abajo).
create or replace function private.recalculate_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.restorations r
  set paid = coalesce((
    select sum(case p.kind when 'pago' then p.amount else -p.amount end)
    from public.payments p where p.restoration_id = r.id
  ), 0)
  where r.id = new.restoration_id;
  return null;
end;
$$;

revoke execute on function private.recalculate_paid() from public, anon, authenticated;

create trigger payments_recalculate_paid
  after insert on public.payments
  for each row execute function private.recalculate_paid();

-- El estado de pago sigue al total y a lo pagado. Corre después de
-- restorations_apply_igv (orden alfabético), que recalcula el total al cambiar el IGV.
create or replace function private.set_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.payment_status := private.payment_status_for(
    new.total,
    new.paid,
    coalesce((
      select sum(amount) from public.payments
      where restoration_id = new.id and kind = 'reembolso'
    ), 0)
  );
  return new;
end;
$$;

revoke execute on function private.set_payment_status() from public, anon, authenticated;

create trigger restorations_set_payment_status
  before update of total, paid, prices_include_igv on public.restorations
  for each row execute function private.set_payment_status();

-- P28: el tipo de pago se cambia solo mientras no haya pagos registrados.
create or replace function private.guard_payment_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_type is distinct from old.payment_type
     and exists (select 1 from public.payments where restoration_id = new.id) then
    raise exception 'Con pagos registrados ya no se cambia el tipo de pago'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_payment_type() from public, anon, authenticated;

create trigger restorations_guard_payment_type
  before update of payment_type on public.restorations
  for each row execute function private.guard_payment_type();

alter table public.payments enable row level security;

create policy "Admin y ventas leen los pagos"
  on public.payments for select to authenticated
  using ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas registran pagos; reembolsos, solo el admin"
  on public.payments for insert to authenticated
  with check (
    source = 'sistema'
    and (
      (kind = 'pago' and (select private.has_role('{admin,ventas}')))
      or (kind = 'reembolso' and (select private.has_role('{admin}')))
    )
  );

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant insert (restoration_id, kind, amount, payment_method_id, method_name, paid_on, reason)
  on public.payments to authenticated;

select audit.enable('public.payments');
