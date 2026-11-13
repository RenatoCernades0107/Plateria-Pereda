-- Mensaje editable al compartir por WhatsApp una cotización de producto personalizado
-- (con el teléfono del contacto arriba). Null: el de la aplicación.
alter table public.settings
  add column quote_share_template text check (length(quote_share_template) <= 4000);
