-- Token de acceso de la app de Shopify (client credentials, vence a las 24 h).
-- Solo lo usa el servidor con la clave secreta: ningún usuario lo puede leer.

create table public.shopify_tokens (
  shop_domain text primary key,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.shopify_tokens is
  'Token vigente de la app de Shopify por tienda. Solo accesible con la clave secreta.';

create trigger shopify_tokens_set_updated_at
  before update on public.shopify_tokens
  for each row execute function private.set_updated_at();

revoke all on public.shopify_tokens from anon, authenticated;
alter table public.shopify_tokens enable row level security;
