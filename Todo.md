# Todo · Sistema de Restauraciones y Cotizador — Platería Pereda

> **Estado:** planificación (todavía no se desarrolla).
> **Última actualización:** 2026-10-03
> Preguntas abiertas, respuestas y decisiones: ver [`Notas.md`](./Notas.md).
> Los pasos o reglas marcados con ⛔ **Pxx** dependen de la respuesta a esa pregunta.

## Índice

1. [Cómo trabajar con este documento](#1-cómo-trabajar-con-este-documento)
2. [Stack y decisiones técnicas](#2-stack-y-decisiones-técnicas)
3. [Entornos](#3-entornos)
4. [Estrategia de pruebas](#4-estrategia-de-pruebas)
5. [Arquitectura y estructura del proyecto](#5-arquitectura-y-estructura-del-proyecto)
6. [Modelo de datos (borrador)](#6-modelo-de-datos-borrador)
7. [Reglas de negocio (borrador a validar)](#7-reglas-de-negocio-borrador-a-validar)
8. [Plan paso a paso](#8-plan-paso-a-paso)
9. [Hitos de entrega](#9-hitos-de-entrega)
10. [Riesgos y mitigaciones](#10-riesgos-y-mitigaciones)
11. [Fuera de alcance](#11-fuera-de-alcance)

---

## 1. Cómo trabajar con este documento

- Cada **paso** es una unidad de trabajo que termina en **al menos un commit** (un commit por cambio o feature).
  Se usa [Conventional Commits](https://www.conventionalcommits.org/es/) en español: `feat(...)`, `fix(...)`, `test(...)`, `chore(...)`, `docs(...)`, `ci(...)`, `perf(...)`.
- Orden de trabajo dentro de un paso:
  1. Tests del dominio primero (TDD cuando es lógica pura).
  2. Migración de BD + tests de BD.
  3. Implementación (server actions / RPC).
  4. Interfaz.
  5. Tests E2E.
- **Definición de "Hecho"** de cada paso:
  - [ ] Lint, typecheck y build sin errores.
  - [ ] Tests unitarios, de BD e integración del paso en verde (y los de pasos anteriores siguen en verde).
  - [ ] Tests E2E del paso en verde (desktop y, cuando aplica, móvil).
  - [ ] Migraciones reproducibles con `supabase db reset` y tipos de TypeScript regenerados.
  - [ ] Casillas marcadas en este archivo y commit hecho.
- Leyenda de pruebas:
  - **Unit** — Vitest (+ Testing Library para componentes). Sin red ni BD.
  - **BD** — pgTAP (`supabase test db`) sobre Supabase local: RLS, triggers, funciones, restricciones.
  - **Integración** — Vitest contra Supabase local (Docker) y el Shopify falso.
  - **E2E** — Playwright contra la app completa (Supabase local + Shopify falso).
  - Cuando un tipo de prueba no aplica se indica **"No aplica"** con el motivo.

---

## 2. Stack y decisiones técnicas

| Área | Elección | Motivo |
|---|---|---|
| Framework | Next.js (App Router, última versión estable) + React + TypeScript `strict` | Pedido; SSR, Server Actions, despliegue nativo en Vercel |
| UI | shadcn/ui + Tailwind CSS + lucide-react | Pedido |
| Formularios | react-hook-form + zod (esquemas compartidos cliente/servidor) | Una sola fuente de validación |
| Tablas | TanStack Table (receta "Data Table" de shadcn) | Filtros, orden, paginación |
| Gráficos | Charts de shadcn (Recharts) | Dashboard |
| Fechas | date-fns + date-fns-tz (zona `America/Lima`) | Cálculo de días correcto |
| BD / Auth / Storage | Supabase (Postgres + RLS, Auth, Storage) | Pedido |
| Cliente Supabase | `@supabase/ssr` + tipos generados con `supabase gen types` | Sesión en SSR, tipado de punta a punta |
| Shopify | Admin GraphQL API (versión fijada) con una app del Dev Dashboard (token de 24 h que el sistema pide y renueva solo) | Clientes, órdenes, pagos, productos, webhooks |
| PDF | `@react-pdf/renderer` en un Route Handler (runtime Node) | PDF con componentes React |
| Tests | Vitest, Testing Library, MSW, Playwright, @axe-core/playwright, pgTAP | Ver §4 |
| Paquetes | pnpm, Node LTS (fijado en `.nvmrc` y `engines`) | Reproducibilidad |
| CI/CD | GitHub Actions + Vercel (integración con Git) | |
| Calidad | ESLint, Prettier (+ plugin de Tailwind), opcional husky + lint-staged | |

**Componentes personalizados** (solo donde shadcn no lo cubre; siempre construidos componiendo primitivas de shadcn):

- `FileUploader` — subida múltiple con cámara del celular, compresión y progreso (shadcn no trae uploader).
- `StatusBadge` / `LocationBadge` — `Badge` de shadcn con mapa de colores por estado/ubicación.
- `PieceStatusActions` — botones de transición según estado de la pieza y rol del usuario.
- `Timeline` — historial de estados y de auditoría.
- `ClientPicker` y `ProductPicker` — `Command` + `Popover` de shadcn con búsqueda remota.
- `MoneyInput` — `Input` con formato de soles.

El resto (Data Table, Date Range Picker, Combobox, Sidebar, Charts) son recetas oficiales de shadcn.

---

## 3. Entornos

| | Prueba (local) | Producción (nube) |
|---|---|---|
| App | `pnpm dev` / `pnpm build && pnpm start` | Vercel (rama `main`); plan Hobby durante el desarrollo y Pro en producción (P40) |
| Supabase | Supabase CLI sobre Docker (`supabase start`) | Proyecto en Supabase Cloud (región sugerida `sa-east-1`, São Paulo); plan Free durante el desarrollo y Pro en producción (P40) |
| Datos | `supabase/seed.sql` + fábricas de test | Datos reales; migraciones con `supabase db push` desde CI |
| Correos de Auth | Mailpit local (incluido en Supabase CLI) | SMTP propio ⛔ P05 |
| Shopify | `SHOPIFY_MODE=fake` (adaptador en memoria) por defecto; `live` contra la tienda de desarrollo (organización del desarrollador, con su propia app) para pruebas manuales | Tienda real (app en la organización de la Platería) |
| Webhooks | Simulados con un script que firma el payload (o túnel opcional hacia la tienda de desarrollo) | URL pública de Vercel |

**Variables de entorno** (validadas al arrancar con zod en `src/lib/env.ts`; `.env.example` versionado, `.env*.local` ignorado):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clave pública / anon)
- `SUPABASE_SECRET_KEY` (clave secreta / service role — **solo servidor**)
- `SHOPIFY_MODE` (`fake` o `live`), `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` (con ellos el sistema pide el token de 24 h y verifica la firma de los webhooks), `SHOPIFY_API_VERSION`
- `CRON_SECRET`, `APP_URL`, `APP_TIMEZONE=America/Lima`
- Regla de seguridad: la app **no arranca** si `SHOPIFY_MODE=fake` en producción (`VERCEL_ENV=production`).

---

## 4. Estrategia de pruebas

Pirámide: muchos tests unitarios (dominio puro) → tests de BD e integración → E2E de los flujos críticos.

- **Unit (Vitest)** — `src/**/*.test.ts(x)`.
  Dominio puro (máquina de estados, derivaciones, cálculo de días, dinero, mensaje de WhatsApp, totales de cotización), esquemas zod, mapeadores de Shopify, verificación HMAC, componentes (Testing Library). Red simulada con MSW.
  Cobertura mínima: **90 % en `src/domain`**, 70 % global.
- **BD (pgTAP)** — `supabase/tests/*.sql`.
  RLS por rol (matriz completa), triggers, RPCs, restricciones, secuencias.
- **Integración (Vitest, proyecto `integration`)** — `*.int.test.ts`.
  Server actions / RPC contra Supabase local. Incluye el **test de consistencia** entre la máquina de estados en TypeScript y la tabla de transiciones en la BD.
- **E2E (Playwright)** — `e2e/**/*.spec.ts`.
  - Proyectos `desktop-chromium` y `mobile` (viewport de celular).
  - Tags: `@smoke`, `@mobile`, `@shopify-live` (este último excluido por defecto; se corre a mano contra la tienda de desarrollo).
  - `globalSetup`: `supabase db reset` + login por rol guardando `storageState`.
  - Accesibilidad con axe en cada página principal.
- **Shopify falso** — implementación en memoria del puerto `ShopifyGateway` + ruta de test `/api/test/shopify` (solo existe si `SHOPIFY_MODE=fake`) para que Playwright inspeccione/resetee lo "enviado a Shopify" y fuerce errores.
- **Webhooks en tests** — helper que firma payloads (HMAC) con el secreto de test y los envía a `/api/webhooks/shopify`.
- **Datos de prueba** — usuarios semilla `admin@pereda.test`, `ventas@pereda.test`, `logistica@pereda.test`; fábricas en `tests/factories` para crear clientes, restauraciones y piezas en cualquier estado.

---

## 5. Arquitectura y estructura del proyecto

**Principios**

1. **Dominio puro** en `src/domain` (sin Next.js ni Supabase) → fácil de testear.
2. **La BD protege las invariantes**: RLS en todas las tablas; los cambios de estado solo se hacen vía RPC transaccional; triggers para los derivados (estado general, ubicación, fechas, totales, auditoría).
3. **Puertos y adaptadores** para Shopify (`live` / `fake`).
4. **Outbox** para toda escritura hacia Shopify: la BD registra el trabajo en la misma transacción del cambio; se procesa de inmediato (`after()` de Next.js) y un cron reintenta los fallidos. Nunca se pierde una orden por un error de red.
5. Mutaciones con **Server Actions** validadas con zod + chequeo de permisos; lecturas en Server Components.

```
.
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/
│   │   │   ├── dashboard/
│   │   │   ├── restauraciones/        (listado, nueva, [id])
│   │   │   ├── piezas/
│   │   │   ├── clientes/              (listado, [id])
│   │   │   ├── cotizaciones/          (listado, nueva, [id])
│   │   │   ├── talleres/
│   │   │   ├── usuarios/
│   │   │   ├── auditoria/
│   │   │   └── configuracion/
│   │   └── api/
│   │       ├── webhooks/shopify/route.ts
│   │       ├── cron/shopify-sync/route.ts
│   │       ├── cotizaciones/[id]/pdf/route.ts
│   │       └── test/shopify/route.ts  (solo modo fake)
│   ├── components/ui/                 (shadcn)
│   ├── components/                    (componentes compuestos del proyecto)
│   ├── domain/                        (lógica pura + tests)
│   ├── lib/                           (env, supabase, shopify, auth, format)
│   └── server/                        (actions y queries)
├── supabase/                          (config.toml, migrations/, seed.sql, tests/)
├── e2e/                               (fixtures, helpers, specs)
├── tests/                             (factories, fixtures, setup)
└── .github/workflows/
```

---

## 6. Modelo de datos (borrador)

- `profiles` — id (= `auth.users.id`), nombre, rol (`admin`, `ventas`, `logistica`), activo.
- `clients` — tipo (`persona`, `empresa`), nombres/apellidos o razón social, tipo y número de documento, email, teléfono, dirección, `shopify_customer_id`, estado de sincronización.
- `contacts` — client_id, nombre, documento, teléfono, email, cargo/relación, activo.
- `workshops` — nombre, contacto, teléfono, dirección, notas, activo.
- `settings` — fila única: datos de la empresa, logo, vigencia por defecto de cotizaciones, términos, plantilla de WhatsApp, % de adelanto por defecto (50 %).
- `materials`, `services` — catálogos editables; la pieza guarda el id del catálogo o un texto libre (P22).
- `payment_methods` — catálogo editable de métodos de pago (efectivo, tarjeta, Yape, Plin).
- `restorations` — código `RES-00001`, client_id, contact_id, tipo de pago (`contado`, `a_cuenta`, `credito`), % de adelanto (50 % por defecto) y adelanto esperado, estado general, estado de pago, total, pagado, saldo, `shopify_order_id`, `shopify_order_name`, notas, creado por/en.
- `pieces` — restoration_id, código `RES-00001-1`, workshop_id, descripción, medida, material, peso (g), servicio, precio, estado, `arrived_at` (llegada física a tienda), `ubicacion` (columna generada), fechas por hito (`approved_at`, `received_at`, `first_sent_at`, `last_returned_at`, `delivered_at`, `cancelled_at`), notas.
- `piece_status_transitions` — from, to, roles permitidos, requiere nota, requiere taller. **Fuente de verdad** de la máquina de estados.
- `piece_status_history` — piece_id, from, to, nota, actor, fecha.
- `restoration_files` — restoration_id, piece_id (vacío = foto general de todas las piezas), ruta en Storage, tipo (`antes`, `despues`, `documento`, `otro`), mime, tamaño, subido por.
- `payments` — **registro de pagos del sistema**: restoration_id, tipo (`pago`, `reembolso`), monto, método, fecha, registrado por, origen (`sistema`, `shopify`), id de transacción en Shopify (único cuando existe), estado de envío a Shopify (`enviado`, `pendiente`, `error`), payload crudo.
- `shopify_sync_jobs` — tipo, entidad, payload, estado (`pendiente`, `procesando`, `ok`, `error`), intentos, próximo intento, último error.
- `shopify_webhook_events` — webhook_id (único), topic, payload, estado, error.
- `shopify_tokens` — token de acceso vigente y su vencimiento (solo servidor; sin acceso desde el navegador).
- `quotes` — código `COT-000001`, cliente (interno o de Shopify) + snapshot de sus datos, contacto, fecha de emisión, vigencia, estado, subtotal, total, notas/condiciones.
- `quote_items` — quote_id, producto/variante de Shopify, título, imagen, personalización, cantidad, precio unitario, subtotal.
- `audit_log` — tabla, id del registro, acción, cambios (`jsonb`), actor, fecha.
- Vistas / funciones: `piece_metrics` (días en taller, días de cumplimiento), funciones `dashboard_*`.

---

## 7. Reglas de negocio (borrador a validar)

### 7.1 Transiciones de estado de la pieza

| Desde | Hacia | Requisitos / efectos |
|---|---|---|
| Registrada | En consulta | Opcional: piezas en condiciones especiales o complicadas. Nota obligatoria (motivo de la consulta) |
| Registrada | Aprobada | El cliente acepta en el momento. Si la pieza ya llegó a tienda, pasa directo a **Recibida** |
| En consulta | En espera de respuesta del cliente | Al enviarle el mensaje de WhatsApp al cliente. Nota (propuesta enviada; puede ajustar el precio) |
| En espera de respuesta | Aprobada | El cliente acepta; lo hace el asesor (→ Recibida si ya llegó) |
| En espera de respuesta | Anulada | El cliente no acepta. Nota (motivo) obligatoria |
| Aprobada | Recibida | Al marcar la llegada a tienda |
| Recibida | Enviada al taller | Taller asignado obligatorio |
| Enviada al taller | Devuelta por el taller | |
| Devuelta por el taller | Entregada | |
| Devuelta por el taller | Observada | Nota obligatoria |
| Observada | Enviada al taller | Tras resolver la observación; taller obligatorio |
| Entregada | Observada | Reclamo posterior a la entrega (propuesta P41 b) |
| Cualquiera excepto Entregada | Anulada | Nota (motivo) obligatoria; estado final (propuestas P41 c y d) |

- **Flujo de consulta (P41):** la consulta es opcional. Cuando se le envía el mensaje al cliente por WhatsApp, la pieza pasa a "En espera de respuesta del cliente"; si el cliente acepta se aprueba y si no, se anula. El rechazo no se registra como estado. "Observada" solo existe después del taller (P17).
- Las propuestas de P41 (b), (c), (d) y (f) se aplican mientras no se diga lo contrario.
- Acción aparte **"Marcar llegada a tienda"** (registra `arrived_at`): disponible mientras la pieza está en Registrada, En consulta, En espera o Aprobada. Si está Aprobada, pasa a Recibida.
- Qué rol puede ejecutar cada transición: ver la matriz de P42 (consultar, aprobar y anular: ventas y admin).

### 7.2 Ubicación de la pieza (columna generada) ⛔ P21

Se evalúa en este orden:

1. Anulada → **Anulada**
2. Entregada → **Entregada**
3. Enviada al taller → **En taller**
4. Cualquier otro estado → **En tienda** si `arrived_at` tiene valor; si no, **Por recibir**.

(Al pasar a Recibida siempre se completa `arrived_at`.)

### 7.3 Estado general de la restauración ⛔ P19

Se ignoran las piezas anuladas y se evalúa en este orden:

1. Todas las piezas anuladas → **Anulada**
2. Todas entregadas → **Completada**
3. Todas devueltas por el taller o entregadas → **Lista**
4. Alguna devuelta o entregada → **Parcialmente lista**
5. Alguna fue enviada al taller al menos una vez (`first_sent_at` con valor) → **En proceso**
6. Todas fueron aprobadas (`approved_at` con valor) → **Aprobada**
7. Si no → **Registrada**

- El estado puede retroceder (p. ej., una pieza devuelta que se observa y vuelve al taller).
- **Creación de la orden en Shopify:** se dispara cuando todas las piezas no anuladas fueron aprobadas (y hay al menos una) y aún no existe orden, sin importar la etiqueta del estado general. Incluye los pagos registrados al aprobar (adelanto), ver §7.5.

### 7.4 Fechas y tiempos ⛔ P23

- Cada transición fija automáticamente su fecha (`approved_at`, `received_at`, `first_sent_at`, `last_returned_at`, `delivered_at`, `cancelled_at`) y queda en el historial con usuario y nota.
- **Días en taller** = suma de los intervalos entre cada "Enviada al taller" y la siguiente salida de ese estado (incluye reenvíos por observación). Si la pieza sigue en el taller se cuenta hasta hoy y se muestra como "en curso".
- **Días de cumplimiento** = desde el registro hasta la entrega (propuesta). Días calendario en zona `America/Lima`.

### 7.5 Pagos ⛔ P28 ⛔ P29

- Tipo de pago: **Al contado** (paga el total), **A cuenta** (adelanto + saldo), **Al crédito** (sin adelanto).
- **Adelanto** ("A cuenta"): se cobra después de aprobar la cotización; por defecto el **50 %** del total (configurable) y editable en cada restauración (P10, N2).
- Los pagos se registran **desde el sistema** (ventas y admin): monto, método (efectivo, tarjeta, Yape, Plin) y fecha. Siempre en la misma orden de Shopify (N1).
- **Envío a Shopify** (plan Grow: la API no acepta pagos parciales en una orden ya creada; P43, a validar en el spike):
  - Los pagos registrados al aprobar (adelanto) se incluyen al **crear la orden** → "Parcialmente pagada".
  - El pago que **completa el saldo** se registra como pago completo → "Pagada".
  - Los pagos intermedios (registrados con la orden ya creada y sin completar el saldo) quedan "pendientes de envío" y llegan a Shopify con el pago que completa el saldo.
  - Los pagos hechos directamente en el POS o el panel llegan por webhook y se suman al registro sin duplicarse (conciliación por id de transacción).
- Pagado = pagos − reembolsos del registro del sistema. Saldo = Total − Pagado.
- Estado de pago automático: **Pendiente** (pagado = 0) → **Parcial** (0 < pagado < total) → **Pagado** (pagado ≥ total).
- Un pago no se edita: si hubo un error, el admin lo corrige con un reembolso (con motivo y auditado).
- **Entrega con saldo pendiente (P45):** si la restauración no es "Al crédito" y tiene saldo, el sistema no deja marcar "Entregada" y muestra "Falta cobrar el saldo" (sin montos). Ventas y admin pueden entregar igual confirmándolo (queda auditado).

---

## 8. Plan paso a paso

### Fase 0 — Preparación (sin código)

#### Paso 0.1 — Resolver preguntas bloqueantes
- [x] Responder las preguntas de `Notas.md` marcadas como bloqueantes (todas respondidas el 2026-10-03).
- [ ] Registrar respuestas y decisiones en `Notas.md` y ajustar este plan.
- Tests: No aplica (documentación).
- Commit: `docs(notas): registra respuestas y decisiones`

#### Paso 0.2 — Cuentas y accesos
- [ ] Repositorio en GitHub (cuenta del desarrollador) con rama `main` protegida (PR + CI en verde).
- [ ] Tienda de desarrollo de Shopify en la organización del desarrollador + app de prueba creada en el Dev Dashboard.
- [ ] Pedir a la Platería que cree la app de producción en el Dev Dashboard de su organización (o que le dé acceso al desarrollador para crearla), con los permisos mínimos: `read_customers`, `write_customers`, `read_orders`, `write_orders`, `read_draft_orders`, `write_draft_orders`, `write_order_edits`, `read_products`, `read_merchant_managed_fulfillment_orders` y `write_merchant_managed_fulfillment_orders` (P44).
- [ ] Proyectos de Supabase (Free) y Vercel (Hobby) a nombre del desarrollador; pasan a Pro antes del lanzamiento (Fase 16).
- [x] Logo (PNG, en `public/`) y colores de marca. Pendiente: logo en SVG para el PDF de cotizaciones.
- Tests: No aplica (configuración de cuentas).

### Fase 1 — Fundaciones

#### Paso 1.1 — Scaffold del proyecto
- [x] `create-next-app` con TypeScript, App Router, carpeta `src/`, alias `@/*`, ESLint; pnpm; `.nvmrc`; `engines` en `package.json`.
- [x] TypeScript `strict` + `noUncheckedIndexedAccess`; Prettier + plugin de Tailwind.
- [x] Estructura de carpetas de §5 y scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`next typegen` + `tsc`), `format`, `format:check`. Los scripts `test`, `test:int`, `test:e2e` y `db:*` se agregan en los pasos 1.2, 1.3 y 1.5, junto con sus herramientas.
- [x] `.env.example` y `.gitignore`.
- **Unit:** No aplica (Vitest se configura en 1.2).
- **E2E:** No aplica (Playwright se configura en 1.3).
- Commit: `chore: inicializa proyecto Next.js con TypeScript, ESLint y Prettier`

#### Paso 1.2 — Infraestructura de tests unitarios
- [x] Vitest con proyectos `unit` (jsdom) e `integration` (node); Testing Library, jest-dom, user-event, MSW (sin salida a la red: falla si una petición no tiene handler); cobertura v8 con umbrales (70 % global, 90 % en `src/domain`). Scripts `test`, `test:watch`, `test:int`, `test:coverage`.
- **Unit:**
  - [x] Test de humo de la utilidad `cn` (y del alias `@/*`).
  - [x] Test de humo de un componente simple (página inicial) y de MSW.
- **E2E:** No aplica.
- Commit: `test: configura Vitest, Testing Library y MSW`

#### Paso 1.3 — Infraestructura E2E
- [x] Playwright con proyectos `desktop-chromium` y `mobile` (Pixel 7, solo tests `@mobile`); `webServer` que levanta la app (dev en local, build + start en CI); trazas y reporte HTML en fallos; `@axe-core/playwright`; fixtures base (`loginAs(role)` se completa en 2.2). Variable opcional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` para usar un Chromium ya instalado.
- **Unit:** No aplica.
- **E2E:**
  - [x] La página inicial carga y no tiene violaciones críticas ni serias de accesibilidad (axe).
- Commit: `test: configura Playwright con proyectos desktop y móvil`

#### Paso 1.4 — shadcn/ui, tema y layout base
- [x] Tailwind + shadcn (estilo new-york para Tailwind 4, `components.json`); componentes base: button, input, form, card, badge, dialog, sheet, sidebar, table, dropdown-menu, command, popover, select, tabs, sonner, skeleton, calendar, chart (+ label, separator, tooltip, breadcrumb, avatar). Como ui.shadcn.com está bloqueado en el entorno de desarrollo, se copiaron desde el repositorio oficial de shadcn en GitHub. Código de terceros: fuera de la cobertura de tests.
- [x] Tema con los colores de plateriapereda.com (beige #eae4e0, terracota #a47668, granate #530000, texto #444444/#222222; botones en #946557 para contraste AA), logo en el menú e ícono de la pestaña, tipografía Geist, formato de soles y fechas `es-PE`.
- [x] `AppShell`: sidebar en desktop / menú en `Sheet` en celular, header con usuario (texto fijo hasta el Paso 2.2), breadcrumbs; páginas vacías de cada módulo; `/` redirige a `/dashboard`.
- [x] Utilidades `formatMoney`, `formatDate` y `formatDateTime` en `src/lib/format.ts`.
- **Unit:**
  - [x] `formatMoney`: `S/ 1,234.50`, cero, negativos, redondeo.
  - [x] `formatDate` en zona Lima (cerca de medianoche UTC).
  - [x] `AppShell` renderiza los enlaces de navegación y marca el módulo actual.
- **E2E:**
  - [x] Navegación entre módulos en desktop.
  - [x] `@mobile` el menú se abre en `Sheet` y navega.
- Commit: `feat(ui): agrega shadcn/ui, tema de la marca y layout responsive`

#### Paso 1.5 — Supabase local con Docker
- [x] `supabase init` (CLI como dependencia de desarrollo); `config.toml` (registro público deshabilitado, contraseña mínima de 8, URLs de redirección locales, puertos por defecto, Mailpit en 54324; sin analytics ni edge functions).
- [x] Clientes `@supabase/ssr`: `server.ts`, `browser.ts`, `admin.ts` (clave secreta, `import 'server-only'`), tipados con `database.types.ts`.
- [x] `src/lib/env.ts` con validación zod (`env.server.ts` para las variables secretas). Se valida al arrancar (`src/instrumentation.ts`: con variables inválidas el servidor responde 500 y lista lo que falta) y, en Vercel, también al compilar (`next.config.ts`), para que un despliegue mal configurado no reemplace al que está en línea. Producción se detecta con `VERCEL_ENV=production`.
- [x] Scripts `db:start`, `db:stop`, `db:status`, `db:reset`, `db:test`, `db:lint`, `db:types` (`supabase gen types typescript --local` + Prettier) y `env:local` (crea o actualiza `.env.local` con la URL y las claves del Supabase local; ninguna clave se versiona).
- [x] pgTAP (lo activa `supabase test db`, no va en las migraciones); primera migración: `pg_trgm`, esquema `private` (funciones internas, no expuesto por la API) y `private.set_updated_at()`.
- **Unit:**
  - [x] `env.ts` falla con variables faltantes o con formato inválido.
  - [x] `env.ts` falla con `SHOPIFY_MODE=fake` en producción (y exige `CRON_SECRET`).
- **BD:**
  - [x] Test de humo: extensiones presentes y `set_updated_at` actualiza la columna.
- **Integración:**
  - [x] Conexión a Supabase local desde Vitest (la URL y las claves se leen de `supabase status`, así que nunca apunta a otra base) y registro público desactivado.
- **E2E:** No aplica (sin interfaz nueva).
- Commit: `chore(db): configura Supabase local con Docker, clientes SSR y validación de entorno`

#### Paso 1.6 — Integración continua
- [x] Workflow `ci.yml` en cada push (todas las ramas) y manual; cancela corridas anteriores de la misma rama. Tras `supabase start`, `pnpm env:local` genera el `.env.local` para la integración y E2E:
  - Job `checks`: instalación con caché, lint, typecheck, formato, unit con cobertura, build.
  - Job `db-e2e`: Supabase CLI, `supabase start` (sin Studio, Realtime, imgproxy ni edge functions), `supabase db lint`, `supabase test db`, verificación de que los tipos generados no tienen diferencias, tests de integración, Playwright (sube el reporte si falla).
- [ ] Protección de la rama `main` exigiendo CI en verde. **Manual** (Settings → Branches en GitHub), cuando exista `main`.
- **Unit / E2E:** No aplica (el pipeline ejecuta las suites existentes).
- Commit: `ci: agrega pipeline de lint, tests unitarios, de BD y E2E`

#### Paso 1.7 — Guía de desarrollo
- [x] `README.md`: requisitos (Node, pnpm, Docker), cómo levantar el entorno local (`pnpm db:start` + `pnpm env:local`), comandos, convenciones de commits y de tests (incluida `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; en entornos sin acceso a AWS ECR, `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`).
- Tests: No aplica (documentación).
- Commit: `docs: agrega guía de desarrollo local`

### Fase 2 — Autenticación, usuarios y roles

#### Paso 2.1 — Perfiles y roles en BD
- [x] Enum `app_role`; tabla `profiles`; trigger que crea el perfil al crear un usuario en `auth.users` (rol desde `app_metadata`, que solo escribe el servidor; sin rol válido queda como logística). Un segundo trigger aplica el rol cuando `app_metadata` cambia después, que es como lo guarda la API de administración de Supabase.
- [x] Funciones `private.current_app_role()` y `private.has_role(roles[])` (`security definer`, `search_path` fijo; solo `authenticated` puede ejecutarlas).
- [x] RLS: cada usuario lee su perfil; admin lee y edita todos.
- [x] Seed: un usuario de prueba por rol (contraseña `Pereda-local-2026`).
- **Unit:** No aplica (lógica en SQL).
- **BD:**
  - [x] El trigger crea el perfil.
  - [x] `has_role` devuelve lo correcto por rol; un usuario inactivo no pasa `has_role`.
  - [x] Ventas/logística no leen ni editan perfiles ajenos ni cambian su propio rol; admin sí. Un anónimo no lee perfiles.
- **Integración:**
  - [x] Los usuarios semilla inician sesión y ven solo los perfiles permitidos (protege contra apagar el login por email en `config.toml`).
- **E2E:** No aplica (sin interfaz).
- Commit: `feat(auth): agrega perfiles, roles y políticas RLS base`

#### Paso 2.2 — Login y protección de rutas ⛔ P31
- [x] Página `/login` (email + contraseña, con el logo), logout (cierra solo la sesión del dispositivo) y recuperación de contraseña (`/recuperar-contrasena` → correo → `/auth/confirm` → `/restablecer-contrasena`; respuesta neutra para no revelar qué emails existen).
- [x] `src/proxy.ts` (el middleware en Next 16) que refresca la sesión, redirige a `/login?next=...` y saca del login a quien ya inició sesión; usuarios inactivos bloqueados al ingresar y expulsados si los desactivan con la sesión abierta (`requireUser` → `/auth/salir`).
- [x] Fixture de Playwright `loginAs(role)` con `storageState` por rol (proyecto `setup` que inicia sesión una vez por rol).
- **Unit:**
  - [x] Esquemas zod del login, recuperar y nueva contraseña; redirección segura (`safeNextPath`) y rutas públicas.
  - [x] El formulario muestra errores de validación y de credenciales; acciones de servidor, rutas `/auth/*` y proxy con Supabase simulado.
- **E2E:**
  - [x] Login correcto con cada rol → dashboard.
  - [x] Credenciales incorrectas → mensaje de error.
  - [x] Ruta protegida sin sesión → redirige a `/login` y vuelve a la ruta tras ingresar.
  - [x] Logout.
  - [x] Usuario desactivado no puede entrar (ni seguir dentro si lo desactivan).
  - [x] `@mobile` login.
  - [x] Recuperación de contraseña completa con el correo de Mailpit; enlace inválido.
- Commit: `feat(auth): agrega login, logout y protección de rutas`

#### Paso 2.3 — Matriz de permisos
- [x] `src/domain/permissions.ts`: `can(role, permiso)` según la matriz acordada (P42) y `homePathFor(role)` (logística entra a `/piezas`).
- [x] Helpers de servidor `requireUser()` / `requirePermission()` para Server Actions y páginas (sin permiso responde 403 con `forbidden()`, que requiere `experimental.authInterrupts`); el menú filtra módulos por rol; la raíz redirige a la pantalla de inicio de cada rol.
- **Unit:**
  - [x] Test de tabla que recorre **toda** la matriz rol × acción contra una copia independiente de la matriz.
  - [x] `requirePermission` responde 403 sin el permiso.
- **E2E:**
  - [x] Logística no ve "Dashboard", "Usuarios", "Configuración", "Cotizaciones" ni "Auditoría" en el menú, recibe 403 al entrar por URL y al iniciar sesión entra directo a `/piezas`. Ventas tampoco entra a la administración.
  - [x] Admin ve todos los módulos.
- Commit: `feat(auth): agrega matriz de permisos por rol`

#### Paso 2.4 — Gestión de usuarios (admin)
- [x] Listado de usuarios (tabla en escritorio, tarjetas en celular); invitar/crear (API de admin con clave secreta, solo servidor; correo de invitación con plantilla propia → crea su contraseña); cambiar rol; activar/desactivar (un admin no puede cambiarse el rol ni desactivarse); reenviar acceso. El email se copia a `profiles` para listar sin consultar Auth.
- **Unit:**
  - [x] Esquema zod del usuario.
  - [x] Las acciones rechazan a quien no es admin y al propio admin sobre sí mismo (dependencias simuladas).
- **Integración:**
  - [x] Crear usuario crea su perfil con el rol y el email correctos.
- **E2E:**
  - [x] Admin crea un usuario de logística → recibe la invitación en Mailpit, crea su contraseña y entra a `/piezas`.
  - [x] Admin cambia el rol y desactiva un usuario → ya no puede entrar. Reenviar acceso envía el correo.
  - [x] Ventas no accede a `/usuarios` (en permisos). `@mobile` vista de tarjetas.
- Commit: `feat(usuarios): agrega gestión de usuarios para administradores`

### Fase 3 — Auditoría

#### Paso 3.1 — Registro de auditoría en BD
- [x] Tabla `audit_log` de solo inserción (sin update/delete por RLS).
- [x] Trigger genérico `audit.log_change()` que guarda solo las columnas cambiadas y el actor (`auth.uid()`; vacío = "Sistema/Shopify").
- [x] Helper SQL para activar la auditoría en cada tabla nueva (se aplica desde `profiles` en adelante).
- **Unit:**
  - [x] Función que convierte un diff en texto legible (p. ej., "Taller: Taller A → Taller B").
- **BD:**
  - [x] Insert, update y delete generan una fila con el diff correcto.
  - [x] El actor es el usuario autenticado.
  - [x] Nadie puede modificar ni borrar `audit_log`; solo admin puede leerlo.
- **E2E:** No aplica (la interfaz llega en 3.2).
- Hecho: tabla `public.audit_log` (actor, nombre del actor, tabla, id, acción y diff `{columna: {old, new}}`); trigger `audit.log_change()` (ignora `id`, `created_at`, `updated_at` y las columnas indicadas; un update sin cambios no deja registro); `audit.enable(tabla, columnas_ignoradas)`; un trigger impide modificar, borrar o vaciar el historial incluso con la clave secreta; `profiles` auditada. Los usuarios creados por la API de administración quedan como "Sistema" (no hay usuario autenticado en esa llamada). `describeChanges()` en `src/domain/audit.ts`.
- Commit: `feat(auditoria): agrega registro automático de cambios en BD`

#### Paso 3.2 — Interfaz de auditoría
- [x] Página `/auditoria` (admin): filtros por usuario, entidad, acción y fechas; paginación.
- [x] Componente `EntityHistory` reutilizable (pestaña "Historial" en restauración, pieza, cliente, taller); logística no la ve (P42).
- **Unit:**
  - [x] `EntityHistory` renderiza cambios legibles.
  - [x] Los filtros se serializan y leen desde la URL.
- **E2E:**
  - [x] Admin cambia el rol de un usuario → el cambio aparece en `/auditoria` con su nombre y fecha.
  - [x] Un usuario que no es admin no accede a `/auditoria`.
- Hecho: `/auditoria` con filtros en la URL (`usuario`, `entidad`, `accion`, `desde`, `hasta`, `pagina`; fechas en hora de Lima), 25 registros por página, tabla en escritorio y tarjetas en el celular. `EntityHistory` + `EntityHistorySection` (no muestra nada a logística) listos para las pestañas "Historial" de los pasos de restauración, pieza, cliente y taller. Ventas lee el historial de las entidades del negocio, pero no los cambios de usuarios (migración `historial_para_ventas`). Se corrigió el hover del botón primario, que bajaba el contraste del texto blanco a 4.06:1.
- Nota: al crear un usuario, Supabase guarda el rol en un segundo paso, así que la auditoría muestra la creación seguida de un cambio de rol hecho por "Sistema".
- Commit: `feat(auditoria): agrega vista de auditoría e historial por entidad`

### Fase 4 — Integración con Shopify (base)

#### Paso 4.1 — Spike técnico en la tienda de desarrollo
Objetivo: validar con llamadas reales antes de construir.
- [x] App de prueba en el Dev Dashboard: obtener el token con *client credentials* (vence a las 24 h) y confirmar cómo se hará en la tienda de la Platería (app en su organización o instalación por enlace).
- [x] Crear cliente persona y empresa como Company (P14 = b): alta de Company con contacto y ubicación, dónde va el RUC, orden con la empresa como comprador.
- [x] Crear una orden con líneas personalizadas (título solo con el código) con y sin pagos incluidos; confirmar que con un adelanto queda "Parcialmente pagada" (comparar `orderCreate` vs. borrador de orden + completar).
- [x] Registrar el pago que completa el saldo con `orderCreateManualPayment` (sin monto) y confirmar que en Grow no hay otra vía para pagos parciales (P43).
- [ ] Registrar un pago parcial desde el POS y ver qué webhooks llegan. *(Requiere una URL pública: se hace con el primer despliegue en Vercel; los webhooks no llegan a localhost.)*
- [x] Editar una orden (quitar línea, cambiar precio, agregar línea) con Order Editing; reembolsar un pago manual.
- [ ] Cambiar el cliente de una orden desde Shopify y ver qué webhook llega (P12). *(Ídem: con el primer despliegue.)*
- [x] Marcar líneas como preparadas (P44).
- [x] Buscar clientes y productos (paginación, variantes, imágenes).
- [x] Documentar resultados y decisiones en `Notas.md`; guardar payloads reales anonimizados como fixtures en `tests/fixtures/shopify/`.
- Tests: No aplica (exploratorio); los fixtures alimentan los tests de los pasos siguientes.
- Commit: `docs(shopify): documenta resultados del spike y agrega fixtures`

#### Paso 4.2 — Puerto `ShopifyGateway` y adaptadores
- [x] Interfaz: `createCustomer`, `updateCustomer`, `searchCustomers`, `getCustomer`, `createOrder` (con pagos iniciales), `findOrderByTag`, `getOrderFinancials`, `editOrder`, `recordFullPayment`, `refundPayment`, `searchProducts`, `getProduct`, `fulfillLines`.
- [x] Autenticación: pide el token con *client credentials*, lo guarda en `shopify_tokens` y lo renueva antes de que venza (o ante un 401).
- [~] Adaptador `live`: cliente GraphQL (fetch, versión de API fijada, timeout, reintentos con backoff ante throttling y 5xx, `userErrors` → errores de dominio tipados).
- [x] Adaptador `fake` en memoria + ruta `/api/test/shopify` (inspeccionar, resetear, forzar errores; 404 fuera del modo fake).
- [x] Factory que elige el adaptador según `SHOPIFY_MODE`.
- **Unit (MSW + fixtures del spike):**
  - [x] Mapeo de respuestas a tipos del dominio.
  - [x] `userErrors` → error tipado.
  - [x] Reintenta ante `THROTTLED` y 5xx; no reintenta ante 4xx.
  - [x] Renueva el token vencido o rechazado (401) y reintenta una sola vez.
  - [x] Paginación de búsquedas.
  - [x] **Contract test** compartido: `fake` y `live` (con MSW) cumplen la misma suite.
- **E2E:** No aplica (sin interfaz). Opcional `@shopify-live`: contract test contra la tienda de desarrollo.
- Hecho (2026-10-03, antes del spike): código en `src/server/shopify/`. El adaptador `live` ya implementa clientes, productos y la lectura de órdenes (`findOrderByTag`, `getOrderFinancials`) con su cliente GraphQL (versión fijada, timeout, reintentos ante THROTTLED/429/5xx/red, una renovación del token ante 401) y el token *client credentials* en `shopify_tokens` (solo clave secreta). **Completado tras el spike 4.1 (2026-10-04):** el adaptador `live` implementa también las escrituras de órdenes (`createOrder` con adelanto y Company, `editOrder` con quitar/cambiar precio/agregar, `recordFullPayment` con caída a pago "manual", `refundPayment` con `@idempotent`, `fulfillLines`), con las mutaciones validadas en la tienda de desarrollo; el emulador de MSW las cubre en el contract test. El contract test corre contra el `fake` y contra el `live` con un emulador de la API en MSW (`tests/msw/shopify-emulator.ts`). `/api/test/shopify` (GET estado, POST `reset`/`fail`) responde 404 fuera del modo fake. `/api/test`, `/api/cron` y `/api/webhooks` no pasan por el login del proxy: cada uno se autentica solo.
- Commit: `feat(shopify): agrega puerto ShopifyGateway con adaptadores live y fake`

#### Paso 4.3 — Outbox de sincronización
- [x] Tabla `shopify_sync_jobs` + función SQL para encolar (la usan triggers y RPCs).
- [x] Procesador idempotente con bloqueo (`FOR UPDATE SKIP LOCKED`), reintentos con backoff y máximo de intentos.
- [x] Ejecución inmediata tras la acción del usuario (`after()`) + endpoint `/api/cron/shopify-sync` protegido con `CRON_SECRET`, invocado cada 5 minutos por Vercel Cron en producción (requiere Pro; se activa en 16.2) y con el script `pnpm shopify:sync` en local.
- [x] Componente `SyncStatus` (Sincronizado / Pendiente / Error + botón "Reintentar").
- **Unit:**
  - [x] Cálculo del backoff.
  - [x] El procesador marca `ok`/`error` y respeta el máximo de intentos (gateway simulado).
  - [x] El endpoint de cron rechaza peticiones sin el secreto.
- **BD:**
  - [x] Dos procesadores concurrentes no toman el mismo job.
  - [x] Solo admin y el servidor ven los jobs.
- **Integración:**
  - [x] Job pendiente → procesado con el fake → estado `ok`.
- **E2E:** se cubre en 6.2 (error forzado → "Reintentar" → sincronizado).
- Hecho: tabla `shopify_sync_jobs` (solo admin la lee) con `private.enqueue_shopify_job()` (clave de idempotencia) y `claim_shopify_jobs()` (solo clave secreta, `FOR UPDATE SKIP LOCKED`, retoma jobs abandonados). Procesador en `src/server/shopify-sync/` con backoff de 30 s a 1 h y máximo de intentos; los errores de datos o credenciales quedan en error de inmediato. Cada módulo registra su handler en `shopifyJobHandlers`. `scheduleShopifySync()` procesa con `after()`; `/api/cron/shopify-sync` exige `Authorization: Bearer CRON_SECRET` (comparación en tiempo constante); `pnpm env:local` genera un `CRON_SECRET` local. `SyncStatus` muestra el estado con "Reintentar" (ventas y admin). El Vercel Cron se agrega en 16.2 (requiere Pro).
- Commit: `feat(shopify): agrega outbox de sincronización con reintentos`

#### Paso 4.4 — Endpoint de webhooks
- [x] Route Handler `/api/webhooks/shopify`: lee el body crudo, verifica HMAC con el client secret (comparación en tiempo constante), valida el dominio de la tienda, guarda el evento en `shopify_webhook_events` (único por `X-Shopify-Webhook-Id`), responde 200 rápido y procesa con `after()`.
- [x] Router por topic (los handlers de pagos se implementan en 11.3).
- [x] Script `pnpm shopify:webhook <topic> <fixture>` que firma y envía un webhook al entorno local.
- [x] Script `pnpm shopify:register-webhooks` (por entorno).
- **Unit:**
  - [x] HMAC válido, inválido y con body alterado.
  - [x] Topic desconocido → se registra y se ignora.
- **Integración:**
  - [x] El mismo webhook enviado dos veces se procesa una sola vez.
- **E2E (API con `request` de Playwright):**
  - [x] Firma inválida → 401.
  - [x] Firma válida → 200 y evento guardado.
- Hecho: `/api/webhooks/shopify` verifica el HMAC del body crudo (tiempo constante) y el dominio de la tienda, guarda en `shopify_webhook_events` (único por `webhook_id`, solo admin lo lee), responde 200 y procesa con `after()`. `processWebhookEvent()` toma el evento de forma atómica (dos procesadores → un solo handler) y lo enruta por topic con `webhookHandlers`; sin handler queda `ignored`. En modo fake sin `SHOPIFY_CLIENT_SECRET` se firma con un secreto de desarrollo (`FAKE_WEBHOOK_SECRET`). Scripts `pnpm shopify:webhook` y `pnpm shopify:register-webhooks` (este último usa `webhookSubscriptionCreate` con `uri`: **validar en el spike 4.1**, junto con la lista de topics). El fixture `customers-update.json` es provisional hasta tener payloads reales.
- Commit: `feat(shopify): agrega endpoint de webhooks con verificación HMAC e idempotencia`

### Fase 5 — Configuración y catálogos

#### Paso 5.1 — Configuración de la empresa
- [x] Tabla `settings` (fila única) + página `/configuracion` (admin): razón social, RUC, dirección, teléfonos, email, logo, vigencia de cotización por defecto, términos y condiciones, plantilla del mensaje de WhatsApp, % de adelanto por defecto (50 %).
- **Unit:**
  - [x] Esquema zod (RUC válido, días > 0, % entre 1 y 100).
- **BD:**
  - [x] Solo admin edita; todos los usuarios autenticados leen.
- **E2E:**
  - [x] Admin cambia la vigencia por defecto y sube el logo → persiste al recargar.
  - [x] Ventas no accede a `/configuracion`.
- Hecho: tabla `settings` de una sola fila (auditada); RUC con dígito verificador (`src/domain/ruc.ts`); plantilla de WhatsApp con variables validadas (`src/domain/whatsapp-template.ts`, vacía = la de la aplicación, con botón "Restaurar mensaje original"); el logo se sube desde el navegador al bucket público `branding` (PNG/JPG/WebP, 2 MB, solo admin escribe) y una Server Action guarda la ruta y borra el anterior. `getSettings()` en `src/server/settings.ts` para los módulos siguientes.
- Commit: `feat(configuracion): agrega configuración de la empresa`

#### Paso 5.2 — Talleres
- [x] CRUD de talleres (nombre, contacto, teléfono, dirección, notas, activo). Los inactivos no se pueden asignar pero se conservan en el historial. Auditoría activa.
- **Unit:**
  - [x] Esquema zod y formulario.
- **BD:**
  - [x] RLS según la matriz de permisos.
  - [x] Nombre único sin distinguir mayúsculas.
  - [x] No se puede borrar un taller con piezas (solo desactivar).
- **E2E:**
  - [x] Crear, editar y desactivar un taller.
  - [x] Nombre duplicado muestra error.
  - [x] `@mobile` crear taller.
- Hecho: tabla `workshops` (nombre único sin distinguir mayúsculas ni espacios, auditada). Todos los usuarios activos la leen (ventas asigna talleres); admin y logística crean y editan; nadie borra, solo se desactiva. La regla "no se borra un taller con piezas" queda cubierta porque no se borra ninguno; en 7.1 la FK de piezas usa `on delete restrict`. El historial ahora omite también los textos vacíos al crear (migración `auditoria_omite_vacios`).
- Commit: `feat(talleres): agrega gestión de talleres`

#### Paso 5.3 — Catálogos de materiales, servicios y métodos de pago
- [x] CRUD simple (nombre, activo; precio sugerido opcional para servicios). Materiales y servicios se eligen de la lista o se escriben libremente (P22). Métodos de pago iniciales: efectivo, tarjeta, Yape y Plin (N1).
- **Unit / BD / E2E:** análogos a 5.2.
- Hecho: tablas `materials`, `services` (precio sugerido opcional) y `payment_methods` (Efectivo, Tarjeta, Yape y Plin cargados en la migración), auditadas, sin borrado. Solo admin gestiona; los materiales los leen todos; servicios y métodos de pago solo admin y ventas (logística no ve dinero, P42). Pestañas en `/configuracion` (Empresa, Materiales, Servicios, Métodos de pago) con un componente `CatalogManager` compartido y `listCatalog()` para los selectores de los pasos siguientes.
- Commit: `feat(catalogos): agrega catálogos de materiales, servicios y métodos de pago`

### Fase 6 — Clientes y contactos

#### Paso 6.1 — Esquema y validaciones
- [x] Tablas `clients` y `contacts` + RLS + auditoría + índices de búsqueda (`pg_trgm` sobre nombre, documento, teléfono, email).
- [x] Esquemas zod: persona (nombres, apellidos, DNI / CE / pasaporte) y empresa (razón social, RUC); teléfono peruano; email.
- **Unit:**
  - [x] DNI (8 dígitos), RUC (11 dígitos, prefijo válido y dígito verificador), teléfono, email.
  - [x] Normalización (espacios, mayúsculas, teléfono en formato E.164 `+51...`).
- **BD:**
  - [x] Documento único por tipo.
  - [x] Un contacto siempre pertenece a un cliente.
  - [x] RLS por rol.
- **E2E:** No aplica (la interfaz llega en 6.2).
- Hecho (2026-10-04): tablas `clients` (persona o empresa, `display_name` generado, ids de Shopify: Customer para persona; Company + ubicación para empresa) y `contacts` (siempre de una empresa; Customer + CompanyContact). Documento único por tipo, teléfono en E.164, email en minúsculas, el tipo de cliente no cambia, no se borran. Todos leen; admin y ventas crean y editan; auditados. Validaciones en `src/domain/documents.ts`, `src/domain/phone.ts` y `src/lib/validation/clients.ts`. **P27 sigue pendiente:** se usó su propuesta (persona: nombres, apellidos y teléfono; empresa: razón social, RUC y teléfono; contacto: nombre y teléfono), definida solo en zod para cambiarla sin migraciones.
- Commit: `feat(clientes): agrega esquema de clientes y contactos`

#### Paso 6.2 — Alta de cliente sincronizada con Shopify
- [x] Diálogo "Nuevo cliente" (persona / empresa) reutilizable desde cualquier formulario.
- [x] Al guardar: se crea en BD y se encola `customer_create`; si Shopify indica que el email/teléfono ya existe, se **vincula** al cliente existente en lugar de duplicarlo.
- [x] Empresa: Company de Shopify con razón social y RUC; sus contactos, como contactos de la Company (P14 = b). Detalles de la API según el spike.
- **Unit:**
  - [x] Mapeo cliente → input de Shopify (persona y empresa).
  - [x] Manejo de "ya existe" → vinculación.
- **Integración:**
  - [x] Crear cliente → job `ok` → `shopify_customer_id` guardado (fake).
- **E2E:**
  - [x] Crear persona y empresa → aparecen como "Sincronizado" y el fake recibió los datos correctos.
  - [x] Error forzado en el fake → "Error de sincronización" → "Reintentar" → sincronizado.
  - [x] `@mobile` crear cliente.
- Hecho (2026-10-04): el gateway suma `createCompany`, `createCompanyContact` y `assignCustomerAsContact` (fake, live y emulador; contract test). Un trigger encola `customer.create` / `company.create` / `contact.create` al registrar (salvo importados con id de Shopify). Handlers idempotentes en `src/server/clients/shopify-sync.ts`: si el email o teléfono ya existe en Shopify vinculan ese cliente; el contacto espera a que su empresa esté sincronizada. `public.shopify_sync_status()` expone el estado a todos los roles (el outbox sigue siendo solo de admin). `clients` suma ciudad y región (código de Shopify, `src/domain/regions.ts`). Diálogo `NewClientDialog` (persona / empresa) reutilizable con `onCreated`; `/clientes` muestra los últimos clientes con su estado y se refresca solo mientras hay pendientes. El fake guarda la descripción de los fallos forzados y crea el error al lanzarlo (en desarrollo las rutas y las acciones pueden cargar copias distintas de las clases de error).
- Ronda 3 del spike: contactos nuevos y existentes ✅, región ARE ✅; un contacto agregado después necesita **rol de compra** en la ubicación para hacer pedidos → el gateway lo asigna al crear o vincular el contacto (validado en las rondas 4 y 5 ✅). Si la empresa ya existe en Shopify con ese RUC, por ahora queda en error con el mensaje de Shopify (se resuelve con la importación de 6.6).
- Commit: `feat(clientes): registra clientes y los sincroniza con Shopify`

#### Paso 6.3 — Buscador unificado `ClientPicker`
- [x] Busca en la BD local (clientes y contactos) y en Shopify (clientes aún no importados); al elegir uno de Shopify se guarda/actualiza localmente.
- [x] Muestra tipo, documento, teléfono y, si es un contacto, la empresa a la que pertenece.
- [x] Debounce, estados de carga y vacío, opción "Crear nuevo".
- **Unit:**
  - [x] Fusión y deduplicación de resultados locales y de Shopify.
  - [x] Componente: navegación con teclado, selección, "Crear nuevo".
- **E2E:**
  - [x] Buscar por nombre, documento y teléfono.
  - [x] Elegir un cliente que solo existe en Shopify (fake) → queda guardado localmente.
- Hecho (2026-10-04): `searchClients()` busca en clientes y contactos activos (nombre, documento, email y dígitos del teléfono) y en Shopify; `mergeClientOptions()` (`src/domain/client-search.ts`) no repite clientes de Shopify que ya están en el sistema (por id, email o teléfono). Si Shopify falla se muestran solo los locales con aviso. Al elegir uno de Shopify, `importShopifyCustomer()` lo guarda como persona ya sincronizada (idempotente; no encola trabajo). `ClientPicker` (cmdk): espera de 300 ms, descarta respuestas viejas, estados de carga y vacío, grupos "En el sistema" / "En Shopify", "Crear nuevo cliente" (abre `NewClientDialog`) y limpia la búsqueda al elegir. En `/clientes` funciona como buscador hasta que llegue el detalle (6.5).
- Commit: `feat(clientes): agrega buscador unificado de clientes y contactos`

#### Paso 6.4 — Contactos
- [x] Alta, edición y desactivación de contactos dentro del cliente y desde el formulario de restauración (`ContactDialog` reutilizable; se conecta al formulario en la Fase 7).
- **Unit:**
  - [x] Esquema y formulario.
- **BD:**
  - [x] RLS por rol.
- **E2E:**
  - [x] Agregar un contacto a una empresa y luego seleccionarlo en el buscador.
- Hecho (2026-10-04): acciones `createContact`, `updateContact` y `setContactActive` (solo admin y ventas, RLS de 6.1); sección "Contactos" en el detalle de la empresa con su estado en Shopify, edición y desactivación (un contacto inactivo deja de salir en el buscador). Al editar un contacto ya sincronizado se encola `contact.update`, que actualiza su Customer en Shopify.
- Commit: junto con 6.5 en `feat(clientes): agrega listado, detalle y contactos de clientes` (comparten acciones y página).

#### Paso 6.5 — Listado y detalle de clientes
- [x] `/clientes`: tabla con búsqueda y filtros (tipo, estado de sincronización).
- [x] `/clientes/[id]`: datos, contactos, restauraciones, cotizaciones, historial; edición (sincroniza con Shopify según P16). Logística solo ve los datos de contacto (sin restauraciones pasadas ni historial, P42).
- **Unit:**
  - [x] Columnas de la tabla y vista de tarjetas en móvil.
- **E2E:**
  - [x] Buscar un cliente y abrir su detalle.
  - [x] Editar datos → se encola la actualización en Shopify.
- Hecho (2026-10-04):
  - Listado con `list_clients()` (BD, security definer con chequeo de rol): texto (nombre, documento, email o dígitos del teléfono), tipo, estado de Shopify (sincronizado / pendiente / con error; importado sin jobs = sincronizado), activos/inactivos/todos y paginación de 25; los filtros viven en la URL. El buscador de `/clientes` abre el detalle (un contacto abre su empresa).
  - Detalle: datos, contactos (empresas), estado de Shopify, "Editar" (reutiliza los formularios del alta; el tipo no cambia), desactivar/activar, sección de restauraciones y cotizaciones (se llena en las Fases 7–8) e historial. Logística no ve notas, restauraciones ni historial, ni puede editar.
  - P16 hacia Shopify: triggers encolan `customer.update`, `company.update` o `contact.update` solo si cambian datos que viven en Shopify y el registro ya tiene su id (si aún no, el alta pendiente lee los datos vigentes). No se repite si ya hay una pendiente; sí si la anterior se está procesando. `updateCompany` del gateway: `companyUpdate` (razón social y RUC), `companyLocationUpdate` (teléfono) y `companyLocationAssignAddress` (dirección de envío y facturación). Un email o teléfono quitado en el sistema no se borra en Shopify.
  - P16 desde Shopify: webhook `customers/update` → `apply_shopify_customer_update()` (solo service role) actualiza la persona o el contacto vinculado sin volver a encolarlo (`app.sync_origin = 'shopify'` en la transacción); ignora valores vacíos o inválidos. Los cambios de Companies hechos en Shopify no llegan por webhook (no hay topic de companies en uso): se editan en el sistema.
  - Ronda 5 del spike ✅ (reporte 20261004214531): `customerUpdate`, `companyUpdate`, `companyLocationUpdate` y `companyLocationAssignAddress` funcionan contra la tienda.
- Commit: `feat(clientes): agrega listado, detalle y contactos de clientes`

#### Paso 6.6 — Importación inicial de clientes de Shopify
- [x] Script / acción de admin que pagina los clientes de Shopify y los inserta o actualiza (idempotente por `shopify_customer_id`).
- **Unit:**
  - [x] Mapeo y upsert idempotente.
- **Integración:**
  - [x] Ejecutar dos veces no duplica clientes.
- **E2E:** No aplica (tarea administrativa puntual).
- Hecho (2026-10-04):
  - `pnpm shopify:import-customers` llama a `POST /api/cron/shopify-import-customers` (protegido con `CRON_SECRET`), que pagina los clientes de Shopify de 100 en 100. Si se acerca al límite de tiempo (4 min) devuelve un cursor y el script sigue desde ahí; un cliente que falla no detiene el resto y se lista al final.
  - `personFromShopify()` normaliza: sin nombres usa apellidos, email o teléfono; descarta emails inválidos y teléfonos que no son E.164.
  - `import_shopify_customer()` (BD, solo service role) decide: nuevo → persona ya sincronizada; ya importado → actualiza nombres, email y teléfono (sin pisar notas ni borrar datos que Shopify no tiene); persona del sistema sin vincular con el mismo email o teléfono → se vincula; Customer de un contacto de empresa → actualiza el contacto. Nada se devuelve a Shopify.
  - Las Companies de Shopify no se importan (las empresas se registran en el sistema y se crean allá).
  - Para probar con la tienda de desarrollo: `pnpm shopify:seed-customers --tienda-de-desarrollo 20` crea clientes de prueba (etiqueta `prueba-sistema`, con casos sin nombres, sin email o sin teléfono) y `--borrar` los elimina. La importación real (~1000 clientes, P15) se hace en el Paso 16.4.
- Commit: `feat(clientes): agrega importación inicial de clientes desde Shopify`

### Fase 7 — Restauraciones: registro y cotización por WhatsApp

#### Paso 7.1 — Esquema de restauraciones y piezas
- [ ] Enums (estado general, estado de pieza, ubicación, estado de pago, tipo de pago); tablas `restorations` y `pieces`; códigos correlativos (`RES-00001`, pieza `RES-00001-1`); RLS; auditoría; índices.
- [ ] Restricciones: precio ≥ 0, peso ≥ 0, % de adelanto entre 1 y 100; total = suma de precios de piezas no anuladas (trigger).
- [ ] Logística lee restauraciones y piezas sin columnas de dinero (vistas o privilegios por columna; P42).
- **Unit:** No aplica (SQL).
- **BD:**
  - [ ] Códigos correlativos únicos.
  - [ ] Total recalculado al insertar, editar y anular piezas.
  - [ ] RLS por rol; logística no puede leer precios ni montos (P42).
- **E2E:** No aplica (sin interfaz).
- Commit: `feat(restauraciones): agrega esquema de restauraciones y piezas`

#### Paso 7.2 — Dominio: dinero y validaciones ⛔ P28
- [x] `src/domain/money.ts` (céntimos enteros, suma, redondeo, formato).
- [x] Esquemas zod de restauración y pieza (campos según P22).
- **Unit:**
  - [x] Sumas sin errores de punto flotante (0.1 + 0.2).
  - [x] Redondeo a 2 decimales.
  - [x] Validaciones de pieza (precio requerido, peso según P22, longitudes máximas).
  - [x] Adelanto esperado: % × total en "A cuenta" (50 % por defecto, editable), 0 en "Crédito", total en "Contado"; redondeo a céntimos.
- **E2E:** No aplica (lógica pura).
- Hecho (2026-10-04): `money.ts` trabaja en céntimos enteros (`toCents`, `toSoles`, `toDecimalString` para la BD y Shopify, `formatCents`, `sumCents`, `percentOf`; empates redondeados lejos del cero, 1.005 → 1.01), `parseMoney()` lee lo que escribe el usuario ("1,234.50", "1234,5", "S/ 12"; tope S/ 99,999,999.99) y `expectedDeposit()` da el adelanto esperado; tipos de pago `contado`, `a_cuenta` y `credito` (el enum de la BD del Paso 7.1 debe usar estos valores). Esquemas en `src/lib/validation/restorations.ts`: la pieza exige solo descripción y precio (≥ 0); medida, material y servicio (del catálogo con id y nombre, o texto libre), peso (> 0, gramos, hasta 2 decimales) y taller son opcionales; "La pieza ya está en tienda" es `arrived`. La restauración exige cliente y entre 1 y 100 piezas; el % de adelanto (1–100, hasta 2 decimales) solo se valida y se guarda en "A cuenta" (unión discriminada, así los errores de las piezas y del % salen juntos). **P28 sigue pendiente** (¿contado = paga todo al aprobar?, ¿crédito para quién?, ¿cambiar el tipo de pago después?): no afecta estos cálculos.
- Commit: `feat(restauraciones): agrega reglas de dinero y validaciones`

#### Paso 7.3 — RPC `create_restoration`
- [ ] Función SQL transaccional que crea la restauración + piezas + historial inicial y devuelve el código; valida permisos y datos.
- **Unit:** No aplica (SQL); el server action se prueba en integración.
- **BD:**
  - [ ] Crea todo o nada.
  - [ ] Rechaza restauraciones sin piezas o con datos inválidos.
  - [ ] Rechaza al rol logística.
- **Integración:**
  - [ ] Server action → RPC → datos correctos y auditados.
- **E2E:** se cubre en 7.4.
- Commit: `feat(restauraciones): agrega creación transaccional de restauraciones`

#### Paso 7.4 — Formulario de registro ⛔ P20
- [ ] `/restauraciones/nueva`: cliente (`ClientPicker`) + contacto opcional, tipo de pago y % de adelanto (50 % por defecto; muestra el monto), notas.
- [ ] Lista dinámica de piezas (agregar, duplicar, quitar). Por pieza: taller (opcional), descripción, medida, material y servicio (lista o texto libre, P22), peso, precio y casilla "La pieza ya está en tienda" (marca `arrived_at`).
- [ ] Total en vivo; diseño mobile-first (piezas como tarjetas colapsables); prevención de doble envío; aviso al salir con cambios sin guardar.
- **Unit:**
  - [ ] Total en vivo al agregar/quitar/editar piezas.
  - [ ] Errores visibles por pieza.
  - [ ] Campos condicionales según el tipo de pago.
- **E2E:**
  - [ ] Registrar una restauración con 3 piezas → redirige al detalle con código y total correctos.
  - [ ] Las validaciones impiden enviar datos incompletos.
  - [ ] Crear un cliente nuevo desde el formulario sin perder lo ya escrito.
  - [ ] `@mobile` registro completo desde el celular.
- Commit: `feat(restauraciones): agrega formulario de registro`

#### Paso 7.5 — Mensaje de cotización para WhatsApp ⛔ P25
- [ ] `src/domain/whatsapp-quote.ts`: arma el mensaje (saludo, código, piezas con servicio y precio, total, tipo de pago, adelanto, condiciones) a partir de la plantilla de configuración.
- [ ] Al registrar se abre un diálogo con la vista previa, botón **Copiar** y botón **Abrir WhatsApp** (`https://wa.me/51XXXXXXXXX?text=...`). También disponible desde el detalle.
- **Unit:**
  - [ ] Snapshot del mensaje para Contado, A cuenta y Crédito.
  - [ ] Excluye piezas anuladas.
  - [ ] Formato de soles y saltos de línea.
  - [ ] URL de wa.me codificada y con el número normalizado.
  - [ ] Sin teléfono → no se muestra "Abrir WhatsApp".
- **E2E:**
  - [ ] Tras registrar aparece el diálogo con el mensaje.
  - [ ] **Copiar** deja el texto en el portapapeles (permiso de clipboard en Chromium).
  - [ ] El enlace de WhatsApp es correcto.
- Avance (2026-10-04): dominio y componente listos, falta conectarlos al registro y al detalle y los E2E. `src/domain/whatsapp-quote.ts`: `buildQuoteMessage(template, data)` arma el mensaje con la plantilla de la configuración (`quoteValues()` da cada variable y `quoteAmounts()` el total y el adelanto, recalculados sin las piezas anuladas) y `whatsappUrl(phone, text)` el enlace a wa.me con el número normalizado (null sin teléfono válido). `WhatsAppQuoteDialog` (`src/components/restorations/`) muestra la vista previa con **Copiar** y, si hay teléfono, **Abrir WhatsApp**. Unit hechos: los tres tipos de pago (snapshots), anuladas excluidas, soles y saltos de línea, URL codificada y sin teléfono. **P25 sigue pendiente:** se usó su propuesta; una línea numerada por pieza ("descripción – servicio: S/ precio", sin servicio solo la descripción), el saludo va al contacto si la restauración tiene uno, y la plantilla por defecto cambia la línea fija del adelanto por la nueva variable `{forma_pago}` ("Al contado (S/ total)", "A cuenta (adelanto del 50 %: S/ …)" o "Al crédito (sin adelanto)"); también hay `{tipo_pago}`. Las plantillas ya personalizadas siguen funcionando.
- Commit: `feat(restauraciones): genera mensaje de cotización para WhatsApp`

#### Paso 7.6 — Detalle de restauración
- [ ] `/restauraciones/[id]`: cabecera (código, cliente, contacto, estado general, estado de pago, total / pagado / saldo, orden de Shopify con enlace), piezas en tarjetas con estado y ubicación, pestañas Piezas, Pagos, Archivos e Historial (logística no ve montos ni las pestañas Pagos e Historial, P42).
- **Unit:**
  - [ ] Badges por estado y ubicación.
  - [ ] Resumen de montos.
- **E2E:**
  - [ ] El detalle muestra los datos registrados.
  - [ ] Logística ve el detalle sin precios ni las pestañas Pagos e Historial (P42).
  - [ ] Logística no puede abrir restauraciones entregadas o anuladas (P42).
  - [ ] `@mobile` legible sin scroll horizontal.
- Avance (2026-10-04): componentes presentacionales en `src/components/restorations/`: `PieceStatusBadge`, `RestorationStatusBadge` y `LocationBadge` (`status-badges.tsx`) y `MoneySummary` (total / pagado / saldo; si se pagó de más, "A favor del cliente"; no se renderiza para logística, P42), con sus unit. Falta la página.
- Commit: `feat(restauraciones): agrega vista de detalle`

#### Paso 7.7 — Edición de restauraciones y piezas
- [ ] Editar datos de la restauración y de sus piezas; agregar piezas a una restauración existente.
- [ ] Antes de crear la orden: todo editable por ventas y admin. Después: libres los campos que no tocan Shopify (P12: contacto, tipo y % de adelanto, notas; medida, material, peso, taller, notas; descripción y servicio, porque el título de la línea lleva solo el código). Los que sí tocan Shopify (precio, agregar o anular pieza) siguen P12 (Paso 9.2).
- [ ] El cliente no se puede cambiar en el sistema una vez registrada la restauración (P12); si hace falta, se cambia en Shopify y llega por webhook (11.3).
- [ ] Todo cambio queda en la auditoría (quién, cuándo, antes → después); los cambios que tocan Shopify piden motivo.
- **Unit:**
  - [ ] `editableFields(restoration, piece, role)` según el estado, el rol y si ya existe la orden.
- **BD:**
  - [ ] El trigger/RPC impide editar campos bloqueados; logística no edita nada salvo fotos.
- **E2E:**
  - [ ] Editar descripción y precio antes de aprobar.
  - [ ] Con la orden creada: el material se puede editar y el precio sigue el flujo de P12.
  - [ ] El cambio aparece en el historial.
- Commit: `feat(restauraciones): permite editar restauraciones y piezas`

### Fase 8 — Estados, ubicación, fechas y tiempos

#### Paso 8.1 — Máquina de estados de la pieza (dominio)
- [x] `src/domain/piece-state-machine.ts`: estados, transiciones de §7.1, requisitos (nota, taller), roles permitidos, `availableTransitions(piece, role)` y `applyTransition()` (devuelve el nuevo estado, las fechas y efectos como "Aprobada → Recibida si ya llegó").
- **Unit:**
  - [x] Test de tabla que recorre **todas** las combinaciones estado origen × destino × rol (válidas e inválidas).
  - [x] Llegada anticipada: aprobar una pieza que ya llegó la deja en Recibida.
  - [x] Nota obligatoria donde corresponde.
  - [x] Taller obligatorio al enviar al taller.
  - [x] Anulada es estado final.
  - [x] Desde "En consulta" solo se pasa a "En espera de respuesta" (o se anula); desde "En espera" solo se aprueba o se anula.
- **E2E:** No aplica (lógica pura).
- Hecho (2026-10-04): estados `registrada`, `en_consulta`, `en_espera`, `aprobada`, `recibida`, `enviada_taller`, `devuelta_taller`, `observada`, `entregada` y `anulada` (el enum de la BD del Paso 7.1 debe usar estos mismos valores). `PIECE_TRANSITIONS` es la tabla que siembra `piece_status_transitions` en 8.3; los roles salen de la matriz de `permissions.ts` (P42) y anular una pieza que está en el taller es solo de admin (P41 d). Nota obligatoria al consultar, anular y observar (también el reclamo después de la entrega); taller obligatorio al enviar (usa el ya asignado o el elegido). `applyTransition()` devuelve los cambios (estado, fechas de §7.4, taller), la nota recortada y los pasos para el historial: aprobar una pieza que ya llegó deja dos pasos (→ Aprobada → Recibida); el reenvío tras una observación conserva `first_sent_at`. Aprobada → Recibida no se ofrece como transición: se hace con `markArrived()` ("Marcar llegada a tienda", todos los roles; en los estados previos a Aprobada solo guarda `arrived_at`). Errores tipados con mensaje (`transicion_invalida`, `rol_no_permitido`, `nota_requerida`, `taller_requerido`). La regla de entrega con saldo pendiente (P45) se agrega en 11.2.
- Commit: `feat(piezas): agrega máquina de estados de piezas`

#### Paso 8.2 — Derivaciones (dominio) ⛔ P19 ⛔ P23
- [x] `deriveRestorationStatus(pieces)` (§7.3), `deriveLocation(piece)` (§7.2), `daysInWorkshop(history, now)`, `fulfillmentDays(piece, now)`, `isReadyForShopifyOrder(pieces)`.
- [x] Escenarios en un fixture JSON compartido (se reutiliza en 8.3 contra la BD).
- **Unit:**
  - [x] Cada regla de §7.3 y su precedencia (con piezas anuladas, mezcla de estados, todas anuladas, retroceso por observación).
  - [x] Ubicación para cada estado con y sin `arrived_at`.
  - [x] Días en taller con varios viajes, en curso, cruzando medianoche en Lima vs. UTC, cambio de mes.
  - [x] Días de cumplimiento.
  - [x] `isReadyForShopifyOrder` con piezas en consulta, aprobadas y anuladas.
- **E2E:** No aplica (lógica pura).
- Hecho (2026-10-04): `src/domain/restoration-status.ts` (estado general, ubicación, `isReadyForShopifyOrder` y sus etiquetas) y `src/domain/piece-days.ts` (días calendario en Lima con `Intl`, sin dependencias nuevas). Escenarios en `tests/fixtures/restorations/derivations.json` (estado general y orden lista, ubicación, días en taller y de cumplimiento) para reutilizarlos en 8.3. **P19 y P23 siguen pendientes:** se usó su propuesta (el estado puede retroceder; días calendario; cumplimiento = del registro de la pieza a su entrega). Sin piezas la restauración queda Registrada; una pieza observada por un reclamo después de la entrega vuelve a contar días de cumplimiento "en curso"; una anulada no tiene días de cumplimiento. Que la orden aún no exista lo revisa el trigger que encola `order_create` (8.3).
- Commit: `feat(piezas): agrega cálculo de estado general, ubicación y tiempos`

#### Paso 8.3 — Implementación en BD
- [ ] Tabla `piece_status_transitions` (semilla con §7.1) y `piece_status_history`.
- [ ] RPC `change_piece_status(piece_ids[], to, note, workshop_id)` (acepta varias piezas para acciones masivas): valida transición y rol, bloquea filas, registra historial, fija fechas, aplica "Aprobada → Recibida".
- [ ] RPC `mark_pieces_arrived(piece_ids[])`.
- [ ] Columna generada `ubicacion`; trigger que recalcula el estado general; trigger que encola `order_create` cuando la restauración está lista para la orden y aún no tiene una.
- [ ] Vista `piece_metrics` (días en taller, días de cumplimiento).
- **Unit:** No aplica (SQL).
- **BD:**
  - [ ] Transición válida, inválida y con rol no permitido.
  - [ ] Fechas fijadas por cada hito.
  - [ ] Historial con actor y nota.
  - [ ] Estado general y ubicación para los escenarios de 8.2.
  - [ ] `order_create` se encola una sola vez.
  - [ ] `piece_metrics` con un historial conocido.
- **Integración:**
  - [ ] **Consistencia**: `piece_status_transitions` es idéntica a la máquina de estados de TypeScript.
  - [ ] Los escenarios del fixture compartido dan el mismo resultado en TypeScript y en la BD.
- **E2E:** se cubre en 8.4.
- Commit: `feat(piezas): implementa cambios de estado, historial y derivados en BD`

#### Paso 8.4 — Interfaz de cambio de estado
- [ ] `PieceStatusActions`: solo muestra transiciones válidas para el rol; diálogo de confirmación con nota y/o taller cuando se requiere; feedback optimista con rollback si falla.
- [ ] Acción "Marcar llegada a tienda".
- [ ] Acciones masivas desde el detalle (seleccionar piezas → "Enviar al Taller X").
- [ ] Asignar / cambiar taller (queda auditado).
- **Unit:**
  - [ ] El componente muestra los botones correctos por estado y rol.
  - [ ] El diálogo exige nota/taller cuando corresponde.
- **E2E:**
  - [ ] Flujo feliz: Registrada → Aprobada → (llegada) Recibida → Enviada al taller → Devuelta → Entregada, verificando estado general y ubicación en cada paso.
  - [ ] Flujo de consulta: En consulta → En espera de respuesta → Aprobada; y En espera → Anulada.
  - [ ] Pieza que llegó antes de aprobarse pasa a Recibida al aprobarla.
  - [ ] Observada y reenvío al taller.
  - [ ] Anular todas las piezas → restauración Anulada.
  - [ ] Cada rol solo ve las acciones que le corresponden (logística no consulta, aprueba ni anula).
  - [ ] `@mobile` cambio de estado desde el celular.
- Commit: `feat(piezas): agrega acciones de cambio de estado en la interfaz`

#### Paso 8.5 — Línea de tiempo
- [ ] `Timeline` por pieza (estado, fecha, usuario, nota) y resumen por restauración; muestra días en taller y días de cumplimiento. Logística no la ve: solo el estado actual, los días en taller y la nota de la última observación (P42).
- **Unit:**
  - [ ] Render de eventos y de días "en curso".
- **E2E:**
  - [ ] Tras varios cambios, la línea de tiempo muestra usuarios y notas en orden.
- Avance (2026-10-04): `Timeline` (`src/components/restorations/timeline.tsx`) ordena los eventos de una pieza (estado, fecha, usuario o "Sistema", nota) y muestra los días en taller y de cumplimiento con `piece-days.ts` ("en curso" si siguen abiertos); unit de eventos y días en curso hechos. Faltan el resumen por restauración, la vista reducida de logística y el E2E.
- Commit: `feat(piezas): agrega línea de tiempo de estados`

### Fase 9 — Orden automática en Shopify

#### Paso 9.1 — Creación de la orden al aprobar ⛔ P13
- [ ] Handler del job `order_create`: primero busca una orden con la etiqueta única de la restauración (evita duplicados si hubo un corte); crea la orden (método elegido en el spike) con el cliente, una línea personalizada por pieza no anulada (título `Restauración RES-00001-1`), precios, etiquetas (`restauracion`, código) y nota con el enlace al sistema; guarda `shopify_order_id` y `shopify_order_name`. Desde la Fase 11 también incluye los pagos registrados al aprobar (11.2).
- [ ] La restauración muestra el número de orden con enlace al admin de Shopify y su estado de sincronización.
- **Unit:**
  - [ ] Mapeo restauración → input de orden (líneas, precios, cliente, etiquetas, impuestos según P13).
  - [ ] Idempotencia: si ya existe una orden con la etiqueta, no crea otra.
- **Integración:**
  - [ ] Aprobar la última pieza → job → orden en el fake → ids guardados.
- **E2E:**
  - [ ] Aprobar todas las piezas → aparece "Orden #xxxx"; el fake recibió líneas y total correctos.
  - [ ] Aprobación parcial → no se crea orden.
  - [ ] Error de Shopify → "Reintentar" → la orden se crea una sola vez.
  - [ ] `@shopify-live` (manual) el mismo flujo contra la tienda de desarrollo.
- Commit: `feat(shopify): crea orden de venta al aprobar la restauración`

#### Paso 9.2 — Cambios posteriores a la orden
- [ ] Según P12: anular una pieza (con motivo; alerta de reembolso si ya pagó más que el nuevo total), cambiar un precio (solo admin, con motivo) o agregar una pieza (cuando se aprueba) → edición automática de la orden vía Order Editing (encolado). Todo queda en la auditoría.
- **Unit:**
  - [ ] Cálculo del cambio (líneas a quitar o ajustar).
- **Integración:**
  - [ ] Anular pieza → job `order_edit` → total actualizado en el fake.
- **E2E:**
  - [ ] Anular una pieza de una restauración aprobada → total y orden actualizados (o aviso, según la decisión).
- Commit: `feat(shopify): sincroniza cambios de piezas con la orden`

#### Paso 9.3 — Entregas como "Preparado" en Shopify
- [ ] Al pasar una pieza a "Entregada" se encola `fulfill_lines`, que marca su línea como preparada en Shopify (P44).
- **Unit:**
  - [ ] Mapeo pieza → línea de la orden de preparación.
- **Integración:**
  - [ ] Entregar una pieza → job → línea preparada en el fake.
- **E2E:**
  - [ ] Entregar todas las piezas → la orden del fake queda "Preparada".
- Commit: `feat(shopify): marca como preparadas las piezas entregadas`

### Fase 10 — Fotos y archivos

#### Paso 10.1 — Storage y datos ⛔ P32
- [ ] Bucket privado `restoration-files` con rutas `restorations/{id}/general/...` (foto general de todas las piezas) y `restorations/{id}/pieces/{id}/...`; políticas de Storage por rol (logística sube y edita fotos, P42); tabla `restoration_files`; URLs firmadas de corta duración.
- **Unit:** No aplica (políticas en SQL).
- **BD:**
  - [ ] Un usuario sin permiso no puede leer ni subir.
  - [ ] Borrar un archivo requiere el rol acordado y elimina el objeto.
- **E2E:** se cubre en 10.2.
- Commit: `feat(archivos): agrega almacenamiento de fotos por restauración y por pieza`

#### Paso 10.2 — Subida y galería
- [ ] `FileUploader`: varios archivos, cámara del celular (`capture`), compresión de imágenes en el navegador, tipos y tamaño máximos (P32), progreso y reintento.
- [ ] Foto general de la restauración + fotos por pieza; clasificación Antes / Después / Documento / Otro; galería con visor y comparación antes/después; descarga; eliminar.
- **Unit:**
  - [ ] Validación de tipo y tamaño.
  - [ ] La compresión se aplica solo a imágenes.
  - [ ] Agrupación por clasificación.
- **E2E:**
  - [ ] Subir 2 fotos "Antes" y 1 PDF → aparecen en la galería.
  - [ ] Logística sube la foto general y una foto "Antes" de una pieza.
  - [ ] Archivo no permitido → mensaje de error.
  - [ ] Eliminar un archivo.
  - [ ] `@mobile` subir foto.
- Commit: `feat(archivos): agrega subida de fotos y documentos con galería`

### Fase 11 — Pagos

#### Paso 11.1 — Registro de pagos y estado de pago ⛔ P29
- [ ] Tabla `payments` (registro del sistema; id de transacción de Shopify único cuando existe); función que recalcula pagado, saldo y estado de pago de la restauración.
- [ ] Dominio `derivePaymentStatus(total, paid)` y `suggestedPayment(restoration)` (adelanto pendiente o saldo).
- **Unit:**
  - [ ] Pendiente, Parcial y Pagado; sobrepago; reembolso total y parcial; total 0.
  - [ ] Monto sugerido: 50 % u otro % del total, y saldo restante.
- **BD:**
  - [ ] Recálculo al insertar pagos y reembolsos.
  - [ ] RLS: logística no lee pagos (P42); solo admin registra reembolsos.
- **E2E:** se cubre en 11.2.
- Commit: `feat(pagos): agrega registro de pagos y estado de pago`

#### Paso 11.2 — Registrar pagos desde el sistema
- [ ] Diálogo "Registrar pago" (ventas y admin): monto sugerido, método y fecha; se puede repartir en varios métodos.
- [ ] Al aprobar la última pieza: paso opcional "Registrar adelanto" en el mismo diálogo; la orden (9.1) se crea con esos pagos incluidos.
- [ ] Envío a Shopify según §7.5: el pago que completa el saldo → `recordFullPayment` (job `payment_record`); pagos intermedios → "pendiente de envío" hasta completar el saldo.
- [ ] Campo opcional "Nombre en Shopify" en los métodos de pago (D34): Visa, Mastercard, transferencia bancaria y PagoEfectivo con el nombre exacto que tienen en la tienda; el resto queda como "manual". Confirmar en el spike los nombres exactos que acepta `paymentMethodName`.
- [ ] Corrección de pagos: solo admin, mediante reembolso (job `payment_refund`) con motivo.
- [ ] Regla de entrega con saldo pendiente (§7.5, P45).
- **Unit:**
  - [ ] Validaciones: monto > 0 y ≤ saldo.
  - [ ] Decisión de envío: incluir al crear la orden / pago completo / pendiente.
- **Integración:**
  - [ ] Aprobar con adelanto → la orden del fake queda "Parcialmente pagada".
  - [ ] Pagar el saldo → "Pagada".
  - [ ] Pago intermedio → queda pendiente y se envía junto con el pago que completa el saldo.
- **E2E:**
  - [ ] Registrar el adelanto al aprobar y el saldo antes de entregar → estado "Pagado" en el sistema y en el fake.
  - [ ] Logística no ve el botón "Registrar pago".
  - [ ] Con saldo pendiente, logística no puede marcar "Entregada" y ve "Falta cobrar el saldo"; ventas entrega confirmándolo.
- Commit: `feat(pagos): registra pagos desde el sistema y los envía a Shopify`

#### Paso 11.3 — Pagos hechos en Shopify (webhooks)
- [ ] Handlers para `orders/paid`, `orders/updated`, `order_transactions/create` y `refunds/create` (según el spike): identifican la restauración por `shopify_order_id`, **consultan a Shopify las transacciones actuales de la orden** (inmune a webhooks desordenados) y agregan al registro las que no vienen del sistema (pagos hechos en el POS o el panel).
- [ ] `orders/updated` también actualiza el cliente de la restauración si lo cambiaron en Shopify (lo busca o crea localmente por `shopify_customer_id`; auditado como cambio desde Shopify).
- [ ] Las órdenes que no son de restauraciones se ignoran.
- **Unit:**
  - [ ] Parseo de los fixtures reales del spike.
  - [ ] Mapeo transacción → pago (tipos venta/captura/reembolso; estados éxito/fallo).
- **Integración:**
  - [ ] Pago parcial hecho en el POS → estado Parcial.
  - [ ] Un pago enviado por el sistema no se duplica al llegar su webhook.
  - [ ] Webhooks duplicados o desordenados → resultado correcto.
  - [ ] Reembolso → recalcula saldo y estado.
  - [ ] Cambio de cliente en Shopify → la restauración muestra el nuevo cliente y queda auditado.
- **E2E:**
  - [ ] Con una restauración aprobada, enviar un webhook firmado de un pago del POS → la interfaz muestra pagado, saldo y "Parcial".
- Commit: `feat(pagos): recibe pagos hechos en Shopify mediante webhooks`

#### Paso 11.4 — Interfaz de pagos
- [ ] Pestaña Pagos (historial con método, fecha, quién lo registró y estado de envío a Shopify); resumen en la cabecera; badge de estado de pago en listados; botón "Resincronizar pagos" (admin).
- **Unit:**
  - [ ] Componentes de resumen e historial.
- **E2E:**
  - [ ] El historial de pagos es visible para ventas y admin.
  - [ ] "Resincronizar pagos" actualiza los montos desde el fake.
- Commit: `feat(pagos): muestra pagos y saldos en la interfaz`

### Fase 12 — Listados y gestión operativa

#### Paso 12.1 — Listado de restauraciones ⛔ P33
- [ ] Data table con paginación y orden en servidor; filtros por estado general, estado de pago, tipo de pago, cliente, taller y rango de fechas; búsqueda por código, cliente o documento; filtros en la URL (compartibles); tarjetas en móvil; exportar CSV (según P33).
- **Unit:**
  - [ ] Parseo y serialización de filtros en la URL.
  - [ ] Constructor de la consulta.
- **BD:**
  - [ ] Los índices se usan en las consultas principales (EXPLAIN con seed de volumen, opcional).
- **E2E:**
  - [ ] Filtrar por estado y por estado de pago; buscar por código.
  - [ ] Recargar mantiene los filtros.
  - [ ] Paginación.
  - [ ] `@mobile` vista de tarjetas.
- Commit: `feat(restauraciones): agrega listado con filtros y búsqueda`

#### Paso 12.2 — Vista de piezas (logística)
- [ ] `/piezas` (página de inicio de logística): todas las piezas con filtros por ubicación, estado, taller y días en taller (> N); acciones masivas (enviar al taller, marcar devueltas); resaltado de piezas con muchos días en taller; sin precios. Logística solo ve piezas en curso (no las entregadas ni anuladas), con la nota de la última observación (P42).
- **Unit:**
  - [ ] Filtros y regla de resaltado.
- **E2E:**
  - [ ] Logística filtra piezas "En tienda / Recibida", selecciona 3 y las envía al Taller A → pasan a "En taller".
  - [ ] `@mobile` acción masiva.
- Commit: `feat(piezas): agrega vista operativa de piezas`

### Fase 13 — Dashboard

#### Paso 13.1 — Métricas en BD ⛔ P33
- [ ] Funciones SQL con filtro de fechas en zona Lima: ventas de restauraciones (monto aprobado y monto cobrado por día/semana/mes), restauraciones por estado, promedio y mediana de días en taller (general y por taller), promedio y mediana de días de cumplimiento, piezas por ubicación.
- **Unit:** No aplica (SQL).
- **BD:**
  - [ ] Con un set de datos conocido, cada función devuelve los valores esperados.
  - [ ] Respetan los permisos por rol.
- **E2E:** se cubre en 13.2.
- Commit: `feat(dashboard): agrega funciones de métricas`

#### Paso 13.2 — Interfaz del dashboard
- [ ] KPIs en tarjetas; gráficos (barras por estado, línea de ventas, barras de días por taller); selector de rango de fechas; accesos rápidos (piezas con más de N días en taller, restauraciones listas para entregar); solo admin y ventas (logística no tiene dashboard, P42).
- **Unit:**
  - [ ] Transformación de datos para los gráficos.
  - [ ] Tarjetas con formato de soles y días.
- **E2E:**
  - [ ] Con datos semilla, los KPIs muestran los valores esperados.
  - [ ] Cambiar el rango de fechas actualiza las métricas.
  - [ ] Logística no accede al dashboard.
  - [ ] `@mobile` dashboard legible.
- Commit: `feat(dashboard): agrega dashboard con métricas`

### Fase 14 — Cotizador de productos personalizados

#### Paso 14.1 — Esquema de cotizaciones ⛔ P34
- [ ] Tablas `quotes` y `quote_items`; código `COT-000001`; estados (borrador, emitida, aceptada, rechazada; "vencida" se calcula); snapshot de los datos del cliente y de los productos; RLS; auditoría.
- **Unit:** No aplica (SQL).
- **BD:**
  - [ ] Correlativo único.
  - [ ] Totales recalculados por trigger.
  - [ ] RLS por rol.
- **E2E:** No aplica (sin interfaz).
- Commit: `feat(cotizador): agrega esquema de cotizaciones`

#### Paso 14.2 — Dominio de la cotización ⛔ P13 ⛔ P35
- [ ] `src/domain/quote.ts`: subtotal por línea (cantidad × precio), total, descuentos e IGV según respuestas, fecha de vigencia (emisión + días), `isExpired`.
- **Unit:**
  - [ ] Cálculos con decimales, cantidades grandes y 0.
  - [ ] Vigencia en zona Lima (fin de mes, año bisiesto).
  - [ ] Detección de cotización vencida.
- **E2E:** No aplica (lógica pura).
- Commit: `feat(cotizador): agrega cálculos de cotización`

#### Paso 14.3 — Selector de productos de Shopify ⛔ P37
- [ ] `ProductPicker`: búsqueda con debounce en el catálogo (título, SKU); muestra imagen, variantes y precio; al elegir crea una línea editable (descripción de la personalización, cantidad, precio). Línea libre sin producto según P37.
- **Unit:**
  - [ ] Mapeo producto/variante → línea de cotización.
  - [ ] Componente: búsqueda y selección de variante.
- **E2E:**
  - [ ] Buscar "anillo" (fake con catálogo semilla) → elegir variante → se crea la línea con el precio del catálogo.
- Commit: `feat(cotizador): agrega selector de productos de Shopify`

#### Paso 14.4 — Editor y listado de cotizaciones ⛔ P38
- [ ] `/cotizaciones/nueva` y `/cotizaciones/[id]`: `ClientPicker` (clientes de Shopify o contactos internos), líneas, subtotales y total en vivo, vigencia (por defecto desde configuración), notas y condiciones; guardar borrador, emitir, duplicar, cambiar estado.
- [ ] `/cotizaciones`: listado con filtros (estado, cliente, fechas) y búsqueda.
- **Unit:**
  - [ ] Totales en vivo en el formulario.
  - [ ] Validaciones: al menos una línea, cantidad > 0, precio ≥ 0.
- **E2E:**
  - [ ] Crear cotización con un cliente de Shopify y 2 productos personalizados → totales correctos → guardar → aparece en el listado.
  - [ ] Crear cotización para un contacto interno.
  - [ ] Duplicar una cotización.
  - [ ] `@mobile` crear cotización.
- Commit: `feat(cotizador): agrega editor y listado de cotizaciones`

#### Paso 14.5 — PDF de la cotización ⛔ P36 ⛔ P37 ⛔ P38
- [ ] Plantilla con `@react-pdf/renderer`: logo, datos de la empresa, código, fechas de emisión y vigencia, datos del cliente (y "Atención:" contacto), tabla de productos (imagen, descripción, personalización, cantidad, precio unitario, subtotal), total, condiciones; fuente embebida (tildes y ñ); varias páginas si hay muchas líneas.
- [ ] Route Handler `/api/cotizaciones/[id]/pdf` (verifica sesión y permiso); nombre de archivo `COT-000001-<cliente>.pdf`.
- **Unit:**
  - [ ] Renderizar a buffer y extraer el texto: contiene cliente, líneas, total y vigencia.
  - [ ] Muchas líneas → varias páginas.
  - [ ] Caracteres especiales (tildes, ñ, S/).
- **E2E:**
  - [ ] "Descargar PDF" dispara la descarga con el nombre correcto y el texto incluye total y vigencia.
  - [ ] Sin sesión → 401.
- Commit: `feat(cotizador): genera PDF de la cotización`

#### Paso 14.6 — Compartir la cotización ⛔ P39
- [ ] En celular: compartir el PDF con el menú del teléfono (Web Share API) para enviarlo directo por WhatsApp; en desktop: descargar + abrir WhatsApp con un mensaje breve.
- **Unit:**
  - [ ] Detección de soporte de Web Share con archivos y fallback.
- **E2E:**
  - [ ] En desktop se ofrece descarga + enlace de WhatsApp; `@mobile` el botón "Compartir" está disponible (Web Share simulado).
- Commit: `feat(cotizador): permite compartir la cotización`

### Fase 15 — Calidad transversal

#### Paso 15.1 — Seguridad
- [ ] Suite pgTAP con la matriz completa: cada tabla × operación × rol.
- [ ] La clave secreta solo se usa en servidor (`server-only`); cabeceras de seguridad (CSP, etc.); límite de tamaño en webhooks; validación zod en todas las actions; `supabase db lint` y advisors de seguridad sin alertas.
- **BD:**
  - [ ] Matriz completa de permisos.
- **E2E:**
  - [ ] Cada rol intenta entrar por URL a los módulos prohibidos → 403.
- Commit: `test(seguridad): agrega matriz completa de permisos`

#### Paso 15.2 — Accesibilidad y responsive
- [ ] axe en todas las páginas principales; revisión en 360 px, 768 px y 1280 px; navegación con teclado.
- **E2E:**
  - [ ] axe sin violaciones serias en cada página.
  - [ ] Sin scroll horizontal en móvil.
- Commit: `test(a11y): agrega pruebas de accesibilidad y responsive`

#### Paso 15.3 — Rendimiento
- [ ] Revisión de índices con `EXPLAIN`; seed de volumen (p. ej., 5 000 restauraciones) para probar listados y dashboard; `loading.tsx` / Suspense; revisión del tamaño del bundle.
- **Integración (opcional):**
  - [ ] Tiempo máximo en las consultas clave con el seed de volumen.
- Commit: `perf: optimiza consultas e índices`

#### Paso 15.4 — Manejo de errores y monitoreo ⛔ P06
- [ ] Páginas de error amigables (`error.tsx`, `not-found.tsx`), logs estructurados en servidor, monitoreo de errores, alerta si hay jobs de Shopify en error.
- **Unit:**
  - [ ] El logger no expone secretos ni datos sensibles.
- **E2E:**
  - [ ] Una ruta inexistente muestra la página 404 amigable.
- Commit: `feat(observabilidad): agrega manejo de errores y monitoreo`

### Fase 16 — Producción

#### Paso 16.1 — Supabase Cloud ⛔ P05
- [ ] Proyecto en región cercana (`sa-east-1`); Auth (registro deshabilitado, SMTP propio, URLs de redirección, plantillas de `supabase/templates/` para recuperación e invitación); buckets; `supabase link`.
- [ ] Workflow `deploy-db.yml`: en push a `main`, `supabase db push` con aprobación manual (environment protegido).
- [ ] Pasar el proyecto a Pro (backups diarios, sin pausa por inactividad).
- Tests: la migración se valida antes en CI con `supabase db reset` + `supabase test db`.
- Commit: `ci: agrega despliegue de migraciones a producción`

#### Paso 16.2 — Vercel ⛔ P03 ⛔ P04
- [ ] Plan Pro; variables de entorno de producción, dominio, Vercel Cron cada 5 minutos para `/api/cron/shopify-sync` (en Hobby el deploy falla con un cron de más de una vez al día), previews según P03.
- Tests: smoke tests de 16.5.
- Commit: `chore(deploy): configura Vercel y cron`

#### Paso 16.3 — Shopify en producción
- [ ] App de producción en la organización de la Platería (Dev Dashboard) con los permisos mínimos; Client ID y secret en Vercel; `pnpm shopify:register-webhooks` apuntando a producción.
  - Permisos (2026-10-04): `read_customers`, `write_customers`, `read_orders`, `write_orders`, `write_order_edits`, `read_products`, `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders` + acceso a datos protegidos de clientes (nombre, email, teléfono, dirección). Si las Companies piden un permiso propio, agregarlo (se confirma en 4.1).
  - [ ] `read_all_orders` no aparece en el Dev Dashboard: pedirlo (probar declararlo en `shopify.app.toml` con Shopify CLI) para que el sistema siga viendo órdenes de más de 60 días. Si no se concede: el sistema avisa qué órdenes de más de 60 días hay que actualizar a mano en Shopify.
- [ ] Verificación manual con checklist (cliente de prueba, orden con adelanto, pago del saldo, reembolso, anulación) y limpieza de los datos de prueba.
- Tests: checklist manual documentado.
- Commit: `docs(shopify): agrega checklist de puesta en producción`

#### Paso 16.4 — Datos iniciales ⛔ P26
- [ ] Usuario admin, usuarios reales, talleres, catálogos, configuración y logo; importación de clientes (6.6) y, si aplica, de restauraciones en curso.
- **Unit / Integración:**
  - [ ] Scripts de carga idempotentes (ejecutarlos dos veces no duplica).
- Commit: `feat(datos): agrega scripts de carga inicial`

#### Paso 16.5 — Smoke tests post-despliegue
- [ ] Suite `@smoke` de solo lectura contra producción (login con un usuario de prueba, dashboard, listado de restauraciones, cotizaciones) ejecutable a mano o tras cada deploy.
- **E2E:**
  - [ ] Suite `@smoke` en verde contra producción.
- Commit: `test(e2e): agrega smoke tests de producción`

### Fase 17 — Entrega

#### Paso 17.1 — Manual de usuario y capacitación
- [ ] Manual por rol (con capturas generadas por Playwright), sesión de capacitación y video corto.
- Tests: No aplica (documentación).
- Commit: `docs: agrega manual de usuario`

#### Paso 17.2 — Documentación técnica
- [ ] README final; runbook (reintentar jobs, reprocesar webhooks, restaurar backup, rotar tokens); decisiones de arquitectura.
- Tests: No aplica (documentación).
- Commit: `docs: agrega runbook y documentación técnica`

---

## 9. Hitos de entrega

| Hito | Fases | Qué se puede demostrar |
|---|---|---|
| H1 | 1–3 | Login por rol, gestión de usuarios, auditoría |
| H2 | 4–7 | Clientes sincronizados con Shopify, registro de restauraciones y mensaje de WhatsApp |
| H3 | 8–10 | Estados, ubicación, tiempos, orden automática en Shopify, fotos |
| H4 | 11–13 | Pagos registrados desde el sistema y desde Shopify, listados, dashboard |
| H5 | 14 | Cotizador con PDF |
| H6 | 15–17 | Producción, capacitación y entrega |

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| En Grow, Shopify no acepta pagos parciales por API ni en el panel (solo Plus) | El sistema lleva el registro de pagos; el adelanto va al crear la orden y el saldo como pago completo; los pagos intermedios se envían con el pago final (P43); validar en el spike |
| Desde 2026 las apps de Shopify se crean en el Dev Dashboard y su token dura 24 h | Renovación automática del token; validar en el spike cómo se instala en la tienda de la Platería (P07) |
| Un mismo pago registrado en el sistema y también en el POS | Conciliación por id de transacción; alerta de sobrepago |
| Webhooks duplicados, desordenados o perdidos | Idempotencia + consulta del resumen financiero de la orden + botón "Resincronizar" |
| Fallos de red o límites de la API de Shopify | Outbox con reintentos y estado visible en la interfaz |
| Reglas duplicadas entre TypeScript y la BD que divergen | Test de consistencia (8.3) y fixtures compartidos |
| Solo 2 entornos: probar en producción es riesgoso | Shopify falso + tienda de desarrollo; migraciones probadas en CI; aprobación manual para `db push` |
| Fotos pesadas desde el celular | Compresión en el navegador y límites de tamaño |
| Cambios de estados durante las pruebas con el cliente | Transiciones como datos (tabla) + tests de tabla fáciles de actualizar |
| Cambios de versión en la API de Shopify | Versión fijada + contract tests + revisión periódica |

---

## 11. Fuera de alcance

- Manejo de stock, facturación electrónica y cambios al checkout de Shopify (según la propuesta).
- Envío automático de mensajes al cliente (API de WhatsApp o email): el mensaje se copia/comparte manualmente.
- App nativa (el sistema se usa desde el navegador en celular y computadora).
