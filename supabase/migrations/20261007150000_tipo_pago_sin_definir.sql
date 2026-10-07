-- Nuevo tipo de pago "sin_definir": aún no se asignó forma de pago (es el valor por
-- defecto al registrar). No espera adelanto ni lleva %, igual que "credito".
alter type public.payment_type add value if not exists 'sin_definir';
