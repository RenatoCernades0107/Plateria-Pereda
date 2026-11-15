-- (Versión 20261113120100: antes compartía la 20261113120000 con cerrar_pieza_en_revision,
-- que es la que consta aplicada en la base desplegada.)
-- Mensaje editable al compartir por WhatsApp una cotización de producto personalizado
-- (con el teléfono del contacto arriba). Null: el de la aplicación.
alter table public.settings
  add column if not exists quote_share_template text check (length(quote_share_template) <= 4000);
