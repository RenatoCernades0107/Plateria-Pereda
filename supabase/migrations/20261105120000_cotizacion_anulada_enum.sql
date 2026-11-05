-- Estado «Anulada» de las cotizaciones (`COT-`, pedido del 2026-11-05): para las que se
-- emitieron por error. El valor nuevo del enum va solo en esta migración; Postgres no
-- deja usarlo en la misma transacción.
alter type public.quote_status add value if not exists 'anulada';
