-- El adelanto ("A cuenta") con que se registra una restauración es un pago real
-- (pedido del 2026-10-14): el registro pide su método y lo guarda en `payments`, igual
-- que "Registrar pago", así cuenta en lo pagado, el estado de pago y la pestaña Pagos.
--   1. El adelanto se acepta aunque supere el saldo: las piezas pueden nacer sin precio
--      (D58) y el total es 0 hasta que el admin los asigna. Un pago del sistema puede
--      llegar hasta lo que sea mayor entre el saldo y lo que falta del adelanto.
--   2. Estado de pago (P29): "Pagado" exige total > 0. Con el adelanto cobrado y aún
--      sin precios queda "Parcial" (antes salía "Pagado" porque pagado ≥ 0).
--   3. Con pagos registrados el adelanto ya no se cambia (como el tipo de pago, P28):
--      lo cobrado se corrige con un reembolso y lo demás se cobra desde Pagos.
--   4. Datos existentes: las restauraciones "A cuenta" con adelanto y sin ningún pago
--      reciben el pago de su adelanto esperado, con la fecha en que se registraron. El
--      método no se conoce: queda "Sin especificar" (sin método del catálogo).

-- 1. Validación del pago: el adelanto puede superar el saldo.
create or replace function private.prepare_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
  v_paid numeric;
  v_deposit numeric;
  v_method text;
begin
  select balance, paid, coalesce(expected_deposit, 0)
  into v_balance, v_paid, v_deposit
  from public.restorations where id = new.restoration_id for update;

  if new.payment_method_id is not null then
    select name into v_method from public.payment_methods where id = new.payment_method_id;
    new.method_name := v_method;
  end if;

  if new.source = 'sistema' then
    if new.kind = 'pago' and new.amount > greatest(v_balance, v_deposit - v_paid) then
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

-- 2. "Pagado" solo con total > 0 (igual que derivePaymentStatus()).
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
    when p_total > 0 and p_paid >= p_total then 'pagado'::public.payment_status
    else 'parcial'::public.payment_status
  end;
$$;

-- 3. Con pagos registrados el adelanto (en soles o el % antiguo) no cambia. Se compara
--    el adelanto efectivo: la edición guarda en soles el que salía del %.
create or replace function private.guard_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_type = old.payment_type
     and coalesce(new.deposit_amount, round(new.total * coalesce(new.deposit_percent, 0) / 100, 2))
       is distinct from
         coalesce(old.deposit_amount, round(old.total * coalesce(old.deposit_percent, 0) / 100, 2))
     and exists (select 1 from public.payments where restoration_id = new.id) then
    raise exception 'Con pagos registrados ya no se cambia el adelanto: los cobros van en Pagos.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_deposit() from public, anon, authenticated;

create trigger restorations_guard_deposit
  before update of deposit_amount, deposit_percent on public.restorations
  for each row execute function private.guard_deposit();

-- 4. Adelantos ya registrados sin pago: se registran como pago.
insert into public.payments (restoration_id, kind, amount, method_name, paid_on)
select
  r.id,
  'pago',
  r.expected_deposit,
  'Sin especificar',
  (r.created_at at time zone 'America/Lima')::date
from public.restorations r
where r.payment_type = 'a_cuenta'
  and r.expected_deposit > 0
  and not exists (select 1 from public.payments p where p.restoration_id = r.id);

-- Estado de pago con la regla nueva (p. ej., adelanto cobrado y total aún 0).
update public.restorations r
set paid = r.paid
where r.paid > 0 and r.total <= 0;
