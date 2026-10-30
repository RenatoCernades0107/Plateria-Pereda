# Runbook

Qué hacer cuando algo falla en producción. Para el diseño detrás de cada pieza, ver [`arquitectura.md`](./arquitectura.md).

> **Pendiente:** producción todavía no está desplegada (Fase 16, ver [`pendientes.md`](./pendientes.md)). Revisar este documento cuando lo esté.

## Dónde mirar

| Qué                        | Dónde                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Errores del servidor       | Logs de Vercel (JSON; filtrar por `level=error` o por `msg`)                                         |
| Sincronización con Shopify | Tabla `shopify_sync_jobs` (`status`: `pending`, `processing`, `ok`, `error`)                         |
| Webhooks recibidos         | Tabla `shopify_webhook_events` (`status`: `received`, `processing`, `processed`, `ignored`, `error`) |
| Quién cambió qué           | `/auditoria` en la app (tabla `audit_log`)                                                           |

Las tablas se consultan desde el SQL Editor de Supabase.

## Reintentar un job de Shopify

Un job pasa a `error` si agotó los reintentos o si Shopify rechazó los datos.

1. Ver el motivo en la columna `last_error` del job, o en el aviso de la app.
2. Corregir la causa (dato faltante, cliente sin contacto, credenciales…).
3. En la app, botón **Reintentar** del registro afectado. Vuelve a encolar el job y lo procesa en el momento.

Si el problema fue general (Shopify caído, credenciales vencidas), los jobs `pending` se procesan solos con el cron cada 5 minutos. Para forzarlo:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/shopify-sync
```

## Reprocesar un webhook

Los eventos en `error` guardan el motivo en `error`. Hoy **no hay comando para reprocesarlos**; el procesamiento solo toma eventos en `received` o `error`, así que basta con volver a dispararlo. Opciones:

- Hacer un cambio mínimo en el pedido o cliente en Shopify, y Shopify enviará un webhook nuevo.
- Pendiente: agregar `pnpm shopify:reprocess-webhooks` que llame a `processWebhookEvent` para los eventos en `error`.

Si los webhooks no llegan, revisar las suscripciones con:

```bash
APP_URL=https://<dominio> pnpm shopify:register-webhooks
```

El script es idempotente: solo agrega lo que falta.

## Rotar credenciales

| Credencial                 | Cómo rotarla                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHOPIFY_CLIENT_SECRET`    | Rotarlo en el Dev Dashboard → actualizarlo en Vercel → redeploy → borrar la fila de `shopify_tokens` para forzar un token nuevo. También firma los webhooks: rotarlo invalida los que estén en vuelo |
| Token de acceso de Shopify | Se renueva solo cada 24 h. Para forzarlo, borrar la fila de `shopify_tokens`                                                                                                                         |
| `SUPABASE_SECRET_KEY`      | Crear una clave nueva en Supabase → Vercel → redeploy → revocar la anterior                                                                                                                          |
| `CRON_SECRET`              | Cambiarlo en Vercel y redeploy (el cron de Vercel lo envía solo)                                                                                                                                     |
| Contraseña de un usuario   | El admin la cambia desde **Usuarios** (la app no envía correos)                                                                                                                                      |

## Restaurar un backup

Requiere Supabase Pro (backups diarios).

1. Supabase → Database → Backups → elegir la fecha → Restore. Reemplaza toda la BD.
2. Lo que se hizo en Shopify después del backup no se deshace: revisar las órdenes y los pagos de ese periodo y reintentar o corregir a mano.
3. Las fotos están en Storage y **no** entran en el backup de la BD.

## Migraciones en producción

Cada migración se prueba en el CI con `supabase db reset` y `supabase test db`. Para aplicarla:

```bash
pnpm exec supabase link --project-ref <ref>
```

```bash
pnpm exec supabase db push
```

Pendiente: automatizarlo con un workflow `deploy-db.yml` con aprobación manual (Paso 16.1).
