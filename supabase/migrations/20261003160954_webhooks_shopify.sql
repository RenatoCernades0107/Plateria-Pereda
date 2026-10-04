-- Webhooks recibidos de Shopify. Cada uno se guarda una sola vez (Shopify puede
-- reenviarlo) y se procesa después de responder, para contestar rápido.

create table public.shopify_webhook_events (
  id bigint generated always as identity primary key,
  -- X-Shopify-Webhook-Id: igual en los reenvíos del mismo webhook.
  webhook_id text not null unique,
  topic text not null,
  shop_domain text not null,
  api_version text,
  payload jsonb not null,
  -- received: por procesar; processing: en proceso; processed: listo;
  -- ignored: topic sin handler; error: falló el handler.
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'ignored', 'error')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.shopify_webhook_events is
  'Webhooks de Shopify recibidos (únicos por webhook_id). Solo admin los lee.';

create index shopify_webhook_events_pending_idx on public.shopify_webhook_events (received_at)
  where status in ('received', 'error');

revoke all on public.shopify_webhook_events from anon, authenticated;
grant select on public.shopify_webhook_events to authenticated;

alter table public.shopify_webhook_events enable row level security;

create policy "Solo admin lee los webhooks de Shopify"
  on public.shopify_webhook_events for select to authenticated
  using ((select private.has_role('{admin}')));
