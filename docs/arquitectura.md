# Arquitectura

Resumen para orientarse en el código. El detalle de cada regla está en [`Notas.md`](../Notas.md) (preguntas `Pxx` y decisiones `Dxx`) y el historial de pasos en [`Todo.md`](../Todo.md).

## Capas

```
Navegador ──▶ src/app (páginas, Server Components)
                 │
                 ▼
             src/server (server actions, consultas)  ──▶  Supabase (Postgres + RLS + RPC)
                 │                                          ▲
                 ▼                                          │
             src/domain (lógica pura)                       │
                 │                                          │
             src/server/shopify (puerto ShopifyGateway) ──▶ Shopify Admin GraphQL
```

| Capa             | Qué va ahí                                                                                    | Regla                                              |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/domain`     | Reglas de negocio puras: máquina de estados, dinero, permisos, filtros, PDF, mensajes         | Sin Next ni Supabase; cobertura mínima 90 %        |
| `src/server`     | Server actions (`*-actions.ts`) y consultas; cada action empieza con `requirePermission(...)` | Solo servidor (`server-only`)                      |
| `src/app`        | Rutas. Los módulos viven en `app/(app)/`; login en `app/(auth)/`; rutas HTTP en `app/api/`    | Sin lógica de negocio                              |
| `src/components` | UI por módulo; `components/ui/` es shadcn                                                     |                                                    |
| `supabase/`      | Migraciones, seed y tests pgTAP                                                               | La BD es la fuente de verdad de estados y permisos |

## Datos y permisos

- **Supabase** guarda todo: Postgres, Auth (email + contraseña, sin registro público) y Storage (bucket `restoration-files`).
- **Roles:** `admin`, `ventas`, `logistica`, uno por usuario (`profiles`). La matriz está en `src/domain/permissions.ts`.
- **Doble control:** la app oculta y bloquea según el permiso, y la BD lo vuelve a exigir con RLS y RPC. Las funciones internas van en el esquema `private`.
- **Escrituras complejas** (crear restauración, cambiar estado, registrar pago, etc.) son RPC en SQL, para que sean atómicas y validen las reglas. La máquina de estados existe en SQL y en `src/domain/piece-state-machine.ts`, y un test comprueba que coinciden (D06).
- **Auditoría:** triggers escriben en `audit_log` quién, cuándo y antes → después (D22). Se ve en `/auditoria`.
- **Cliente admin** (`src/lib/supabase/admin.ts`): usa la clave secreta y salta RLS. Solo para el outbox, los webhooks y los crons.

## Integración con Shopify

Shopify es un sistema externo: el sistema nunca espera a Shopify para guardar algo.

- **Puerto `ShopifyGateway`** (`src/server/shopify/gateway.ts`) con dos adaptadores: `live` (API real) y `fake` (en memoria). Se elige con `SHOPIFY_MODE`. Los tests nunca llaman a Shopify real (D04).
- **Token:** la app del Dev Dashboard usa _client credentials_; el token dura 24 h, se guarda en `shopify_tokens` y se renueva solo.
- **Salida (outbox):** cada cambio que debe llegar a Shopify (alta o edición de cliente, crear o editar orden, pagos, "Preparado") se encola en `shopify_sync_jobs` dentro de la misma transacción. Se procesa justo después de responder al usuario (`after()`) y, si falla, lo reintenta el cron `/api/cron/shopify-sync` con backoff. Los handlers son idempotentes (D05).
- **Entrada (webhooks):** `/api/webhooks/shopify` valida la firma HMAC y la tienda, guarda el evento en `shopify_webhook_events` (sin duplicar por `webhook_id`) y responde 200; lo procesa después. Topics: `customers/update`, `orders/updated`, `orders/cancelled`, `orders/paid`, `order_transactions/create` y `refunds/create`.
- **Orden de Shopify:** se crea cuando la restauración se aprueba y todas las piezas que se cobran tienen precio. Lleva una línea personalizada por pieza con el código como título (D12, D30, D58).

## Decisiones clave

Las que más condicionan el código (lista completa en `Notas.md` → "Decisiones tomadas"):

| #       | Decisión                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| D04/D05 | Shopify detrás de un puerto; outbox para salir y webhooks idempotentes para entrar                                         |
| D06     | Los estados se calculan en la BD (RPC + triggers)                                                                          |
| D10/D20 | Plan Grow: la API no permite pagos parciales, así que los pagos se registran en el sistema y se reflejan en la orden (D34) |
| D16     | Logística no ve dinero (precios totales, pagos, métricas)                                                                  |
| D25/D31 | El cliente de una restauración solo se cambia desde Shopify (llega por webhook)                                            |
| D35     | Las cotizaciones de WhatsApp (`CWA-`) no son restauraciones: no van a Shopify                                              |
| D41/D47 | Estado de la pieza y ubicación son dos ejes distintos                                                                      |
| D66     | Sin IGV en el sistema                                                                                                      |
| D71     | Tipos de guía Normal / Interna / Observada; solo la Normal va a Shopify y lleva pagos                                      |

## Observabilidad

- Logs JSON con `src/lib/logger.ts` (oculta secretos y datos personales). En producción se leen en los logs de Vercel.
- Los errores de sincronización con Shopify se ven en la app: el admin ve un aviso en el encabezado y cada registro tiene un botón "Reintentar".
- No hay herramienta externa de monitoreo (P06 sigue abierta).
