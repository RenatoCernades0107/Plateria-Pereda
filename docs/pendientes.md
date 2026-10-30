# Estado y pendientes

**Actualizado:** 2026-10-30

## Estado

Las Fases 1 a 15 de [`Todo.md`](../Todo.md) están terminadas: el sistema funciona completo en local y en el CI. **Falta llevarlo a producción (Fase 16) y entregarlo (Fase 17).** Todo se probó contra la tienda de desarrollo de Shopify (`peredadev.myshopify.com`), nunca contra la tienda real.

## 1. Producción (Fase 16)

En este orden:

1. **Supabase Cloud** (16.1)
   - Proyecto en `sa-east-1`, plan Pro (backups diarios, sin pausa).
   - Auth: registro deshabilitado, URLs de redirección. La app no envía correos (el admin crea usuarios y contraseñas), así que el SMTP solo hace falta si se decide lo contrario (P05).
   - `supabase link` y `supabase db push` para crear el esquema y el bucket.
   - Workflow `deploy-db.yml` con aprobación manual.
2. **Vercel** (16.2)
   - Plan Pro, dominio (P04) y variables de entorno de `.env.example` con `SHOPIFY_MODE=live`.
   - Cron cada 5 minutos a `/api/cron/shopify-sync`. **Todavía no hay `vercel.json`**: crearlo.
   - Decidir qué hacer con las previews (P03).
3. **Shopify** (16.3)
   - La Platería crea la app en el Dev Dashboard de su organización con los permisos de `Todo.md` → Paso 0.2 (P44).
   - Client ID y secret en Vercel; luego `pnpm shopify:register-webhooks` con `APP_URL` de producción.
   - Pedir `read_all_orders` (órdenes de más de 60 días).
   - Checklist manual: cliente de prueba, orden con adelanto, pago del saldo, reembolso y anulación. Después, borrar los datos de prueba.
   - Con la URL pública, completar las dos pruebas del Paso 4.1: pago parcial desde el POS y cambio de cliente de una orden (P12).
4. **Datos iniciales** (16.4): usuario admin, usuarios reales, talleres, catálogos, configuración y logo; `pnpm shopify:import-customers`. Falta decidir si se migran restauraciones en curso (P26).
5. **Smoke tests** (16.5): suite `@smoke` de solo lectura contra producción.

## 2. Entrega (Fase 17)

- Manual de usuario por rol (capturas con Playwright), capacitación y video corto (17.1).

## 3. Mejoras técnicas conocidas

- Comando para reprocesar webhooks en error (ver [`runbook.md`](./runbook.md)).
- Logo en SVG para el PDF de cotizaciones (hoy es PNG).
- PDF de cotización con muchas líneas (varias páginas): sin probar.
- Test `@shopify-live` manual del flujo de orden contra la tienda de desarrollo (9.1).
- Herramienta de monitoreo de errores, si se decide (P06).

## 4. Preguntas abiertas con el negocio

Detalle en [`Notas.md`](../Notas.md). Ninguna bloquea, pero conviene cerrarlas antes del lanzamiento:

| Pregunta | Tema                                                                   |
| -------- | ---------------------------------------------------------------------- |
| S1–S5    | Supuestos generales (idioma, moneda, zona horaria, una tienda, un rol) |
| P03–P06  | Previews, dominio, correo de acceso, monitoreo                         |
| P26      | ¿Se migran restauraciones en curso?                                    |

El resumen al inicio de `Notas.md` está desactualizado (2026-10-12): varias preguntas que figuran como pendientes ya se resolvieron y están en la tabla de decisiones (p. ej., P28 → D57, P33 → D78).
