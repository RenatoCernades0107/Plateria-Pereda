-- Cotizaciones: estados «Facturada» y «Reembolsada» (después de Aceptada). Van en su
-- propia migración porque un valor nuevo del enum no se puede usar en la misma
-- transacción que lo crea; la lógica está en 20261105130100.
alter type public.quote_status add value if not exists 'facturada';
alter type public.quote_status add value if not exists 'reembolsada';
