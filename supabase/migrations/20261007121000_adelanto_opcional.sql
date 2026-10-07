-- El adelanto ("A cuenta") pasa a ser opcional: deposit_percent puede quedar vacío
-- con tipo de pago "a_cuenta" (sin adelanto). Solo debe ser nulo en los demás tipos.

alter table public.restorations drop constraint restorations_deposit_percent;
alter table public.restorations add constraint restorations_deposit_percent check (
  payment_type = 'a_cuenta' or deposit_percent is null
);

alter table public.whatsapp_quotes drop constraint whatsapp_quotes_deposit_percent;
alter table public.whatsapp_quotes add constraint whatsapp_quotes_deposit_percent check (
  payment_type = 'a_cuenta' or deposit_percent is null
);

-- Sin porcentaje, el adelanto esperado es 0.
alter table public.restorations drop column expected_deposit;
alter table public.restorations add column expected_deposit numeric(12, 2) generated always as (
  case payment_type
    when 'a_cuenta' then round(total * coalesce(deposit_percent, 0) / 100, 2)
    when 'contado' then total
    else 0
  end
) stored;
