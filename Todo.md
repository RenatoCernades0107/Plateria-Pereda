# Todo · Sistema de Restauraciones y Cotizador — Platería Pereda

> **Estado:** planificación (todavía no se desarrolla).
> **Última actualización:** 2026-09-30
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
| Shopify | Admin GraphQL API (versión fijada) con token de una app de la tienda | Clientes, órdenes, productos, webhooks |
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
| App | `pnpm dev` / `pnpm build && pnpm start` | Vercel (rama `main`) |
| Supabase | Supabase CLI sobre Docker (`supabase start`) | Proyecto en Supabase Cloud (región sugerida `sa-east-1`, São Paulo) ⛔ P02 |
| Datos | `supabase/seed.sql` + fábricas de test | Datos reales; migraciones con `supabase db push` desde CI |
| Correos de Auth | Mailpit local (incluido en Supabase CLI) | SMTP propio ⛔ P05 |
| Shopify | `SHOPIFY_MODE=fake` (adaptador en memoria) por defecto; `live` contra la tienda de desarrollo para pruebas manuales ⛔ P08 | Tienda real |
| Webhooks | Simulados con un script que firma el payload (o túnel opcional hacia la tienda de desarrollo) | URL pública de Vercel |

**Variables de entorno** (validadas al arrancar con zod en `src/lib/env.ts`; `.env.example` versionado, `.env*.local` ignorado):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clave pública / anon)
- `SUPABASE_SECRET_KEY` (clave secreta / service role — **solo servidor**)
- `SHOPIFY_MODE` (`fake` o `live`), `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_VERSION`, `SHOPIFY_WEBHOOK_SECRET`
- `CRON_SECRET`, `APP_URL`, `APP_TIMEZONE=America/Lima`
- Regla de seguridad: la app **no arranca** si `SHOPIFY_MODE=fake` en producción.

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
- `settings` — fila única: datos de la empresa, logo, vigencia por defecto de cotizaciones, términos, plantilla de WhatsApp, % mínimo de adelanto.
- `materials`, `services` — catálogos editables ⛔ P22.
- `restorations` — código `RES-000001`, client_id, contact_id, tipo de pago (`contado`, `a_cuenta`, `credito`), adelanto acordado, estado general, estado de pago, total, pagado, saldo, `shopify_order_id`, `shopify_order_name`, notas, creado por/en.
- `pieces` — restoration_id, código `RES-000001-1`, workshop_id, descripción, medida, material, peso (g), servicio, precio, estado, `arrived_at` (llegada física a tienda), `ubicacion` (columna generada), fechas por hito (`approved_at`, `received_at`, `first_sent_at`, `last_returned_at`, `delivered_at`, `cancelled_at`), notas.
- `piece_status_transitions` — from, to, roles permitidos, requiere nota, requiere taller. **Fuente de verdad** de la máquina de estados.
- `piece_status_history` — piece_id, from, to, nota, actor, fecha.
- `piece_files` — piece_id, ruta en Storage, tipo (`antes`, `despues`, `documento`, `otro`), mime, tamaño, subido por.
- `payments` — restoration_id, id de transacción en Shopify (único), tipo, monto, fecha, payload crudo.
- `shopify_sync_jobs` — tipo, entidad, payload, estado (`pendiente`, `procesando`, `ok`, `error`), intentos, próximo intento, último error.
- `shopify_webhook_events` — webhook_id (único), topic, payload, estado, error.
- `quotes` — código `COT-000001`, cliente (interno o de Shopify) + snapshot de sus datos, contacto, fecha de emisión, vigencia, estado, subtotal, total, notas/condiciones.
- `quote_items` — quote_id, producto/variante de Shopify, título, imagen, personalización, cantidad, precio unitario, subtotal.
- `audit_log` — tabla, id del registro, acción, cambios (`jsonb`), actor, fecha.
- Vistas / funciones: `piece_metrics` (días en taller, días de cumplimiento), funciones `dashboard_*`.

---

## 7. Reglas de negocio (borrador a validar)

### 7.1 Transiciones de estado de la pieza ⛔ P17

| Desde | Hacia | Requisitos / efectos |
|---|---|---|
| Registrada | En consulta | Nota obligatoria (motivo de la consulta) |
| Registrada | Aprobada | Si la pieza ya llegó a tienda, pasa directo a **Recibida** |
| En consulta | En espera de respuesta del cliente | Nota (propuesta enviada; puede ajustar el precio) |
| En consulta | Aprobada | Revisión que no necesita consultar al cliente (→ Recibida si ya llegó) |
| En espera de respuesta | Aprobada | Cliente acepta (→ Recibida si ya llegó) |
| En espera de respuesta | Observada | Cliente rechaza con observación; nota obligatoria. ¿Qué sigue? ⛔ P17 |
| Aprobada | Recibida | Al marcar la llegada a tienda |
| Recibida | Enviada al taller | Taller asignado obligatorio |
| Enviada al taller | Devuelta por el taller | |
| Devuelta por el taller | Entregada | |
| Devuelta por el taller | Observada | Nota obligatoria |
| Observada | Enviada al taller | Tras resolver la observación; taller obligatorio |
| Entregada | Observada | Reclamo posterior a la entrega ⛔ P17 |
| Cualquiera excepto Entregada | Anulada | Nota (motivo) obligatoria; estado final ⛔ P17 |

- Acción aparte **"Marcar llegada a tienda"** (registra `arrived_at`): disponible mientras la pieza está en Registrada, En consulta, En espera o Aprobada. Si está Aprobada, pasa a Recibida.
- Qué rol puede ejecutar cada transición: ver matriz en ⛔ P30.

### 7.2 Ubicación de la pieza (columna generada) ⛔ P21

Se evalúa en este orden:

1. Anulada → **Anulada**
2. Entregada → **Entregada**
3. Enviada al taller → **En taller**
4. Cualquier otro estado → **En tienda** si `arrived_at` tiene valor; si no, **Por recibir**.

(Al pasar a Recibida siempre se completa `arrived_at`.)

### 7.3 Estado general de la restauración ⛔ P18 ⛔ P19

Se ignoran las piezas anuladas y se evalúa en este orden:

1. Todas las piezas anuladas → **Anulada**
2. Todas entregadas → **Completada**
3. Todas devueltas por el taller o entregadas → **Lista**
4. Alguna devuelta o entregada → **Parcialmente lista**
5. Alguna fue enviada al taller al menos una vez (`first_sent_at` con valor) → **En proceso**
6. Todas fueron aprobadas (`approved_at` con valor) → **Aprobada**
7. Si no → **Registrada**

- El estado puede retroceder (p. ej., una pieza devuelta que se observa y vuelve al taller).
- **Creación de la orden en Shopify:** se dispara cuando todas las piezas no anuladas fueron aprobadas (y hay al menos una) y aún no existe orden, sin importar la etiqueta del estado general.

### 7.4 Fechas y tiempos ⛔ P23

- Cada transición fija automáticamente su fecha (`approved_at`, `received_at`, `first_sent_at`, `last_returned_at`, `delivered_at`, `cancelled_at`) y queda en el historial con usuario y nota.
- **Días en taller** = suma de los intervalos entre cada "Enviada al taller" y la siguiente salida de ese estado (incluye reenvíos por observación). Si la pieza sigue en el taller se cuenta hasta hoy y se muestra como "en curso".
- **Días de cumplimiento** = desde el registro hasta la entrega (propuesta). Días calendario en zona `America/Lima`.

### 7.5 Pagos ⛔ P09 ⛔ P10 ⛔ P28 ⛔ P29

- Tipo de pago: **Al contado** (paga el total), **A cuenta** (adelanto + saldo), **Al crédito** (sin adelanto).
- Pagado = transacciones exitosas en Shopify − reembolsos. Saldo = Total − Pagado.
- Estado de pago automático: **Pendiente** (pagado = 0) → **Parcial** (0 < pagado < total) → **Pagado** (pagado ≥ total).

---

## 8. Plan paso a paso

### Fase 0 — Preparación (sin código)

#### Paso 0.1 — Resolver preguntas bloqueantes
- [ ] Responder las preguntas de `Notas.md` marcadas como bloqueantes (P01, P02, P07–P12, P17, P18, P22, P30).
- [ ] Registrar respuestas y decisiones en `Notas.md` y ajustar este plan.
- Tests: No aplica (documentación).
- Commit: `docs(notas): registra respuestas y decisiones`

#### Paso 0.2 — Cuentas y accesos ⛔ P01 ⛔ P07 ⛔ P08
- [ ] Repositorio en GitHub con rama `main` protegida (PR + CI en verde).
- [ ] Tienda de desarrollo de Shopify + app con scopes mínimos: `read_customers`, `write_customers`, `read_orders`, `write_orders`, `read_draft_orders`, `write_draft_orders`, `write_order_edits`, `read_products`.
- [ ] Proyecto de Supabase Cloud (prod) y proyecto de Vercel creados (se configuran en la Fase 16).
- [ ] Logo en alta resolución (SVG/PNG) y colores de marca.
- Tests: No aplica (configuración de cuentas).

### Fase 1 — Fundaciones

#### Paso 1.1 — Scaffold del proyecto
- [ ] `create-next-app` con TypeScript, App Router, carpeta `src/`, alias `@/*`, ESLint; pnpm; `.nvmrc`; `engines` en `package.json`.
- [ ] TypeScript `strict` + `noUncheckedIndexedAccess`; Prettier + plugin de Tailwind.
- [ ] Estructura de carpetas de §5 y scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `format`, `test`, `test:int`, `test:e2e`, `db:start`, `db:reset`, `db:test`, `db:types`.
- [ ] `.env.example` y `.gitignore`.
- **Unit:** No aplica (Vitest se configura en 1.2).
- **E2E:** No aplica (Playwright se configura en 1.3).
- Commit: `chore: inicializa proyecto Next.js con TypeScript, ESLint y Prettier`

#### Paso 1.2 — Infraestructura de tests unitarios
- [ ] Vitest con proyectos `unit` (jsdom/node) e `integration` (node); Testing Library, jest-dom, user-event, MSW; cobertura v8 con umbrales.
- **Unit:**
  - [ ] Test de humo de la utilidad `cn`.
  - [ ] Test de humo de un componente simple.
- **E2E:** No aplica.
- Commit: `test: configura Vitest, Testing Library y MSW`

#### Paso 1.3 — Infraestructura E2E
- [ ] Playwright con proyectos `desktop-chromium` y `mobile`; `webServer` que levanta la app; trazas y reporte HTML en fallos; `@axe-core/playwright`; fixtures base (`loginAs(role)` se completa en 2.2).
- **Unit:** No aplica.
- **E2E:**
  - [ ] La página inicial carga y no tiene violaciones críticas de accesibilidad (axe).
- Commit: `test: configura Playwright con proyectos desktop y móvil`

#### Paso 1.4 — shadcn/ui, tema y layout base
- [ ] Tailwind + `shadcn init`; componentes base: button, input, form, card, badge, dialog, sheet, sidebar, table, dropdown-menu, command, popover, select, tabs, sonner, skeleton, calendar, chart.
- [ ] Tema con colores de la marca, tipografía, formato de soles y fechas `es-PE`.
- [ ] `AppShell`: sidebar en desktop / menú en `Sheet` en celular, header con usuario, breadcrumbs; páginas vacías de cada módulo.
- [ ] Utilidades `formatMoney` y `formatDate` en `src/lib/format.ts`.
- **Unit:**
  - [ ] `formatMoney`: `S/ 1,234.50`, cero, negativos, redondeo.
  - [ ] `formatDate` en zona Lima (cerca de medianoche UTC).
  - [ ] `AppShell` renderiza los enlaces de navegación.
- **E2E:**
  - [ ] Navegación entre módulos en desktop.
  - [ ] `@mobile` el menú se abre en `Sheet` y navega.
- Commit: `feat(ui): agrega shadcn/ui, tema de la marca y layout responsive`

#### Paso 1.5 — Supabase local con Docker
- [ ] `supabase init`; `config.toml` (registro público deshabilitado, puertos, Mailpit).
- [ ] Clientes `@supabase/ssr`: `server.ts`, `browser.ts`, `admin.ts` (clave secreta, `import 'server-only'`).
- [ ] `src/lib/env.ts` con validación zod.
- [ ] Scripts `db:types` (`supabase gen types typescript --local`), `db:reset`, `db:test`.
- [ ] pgTAP habilitado; primera migración: extensiones (`pgtap` en local, `pg_trgm`) y función `set_updated_at`.
- **Unit:**
  - [ ] `env.ts` falla con variables faltantes o con formato inválido.
  - [ ] `env.ts` falla con `SHOPIFY_MODE=fake` en producción.
- **BD:**
  - [ ] Test de humo: extensiones presentes y `set_updated_at` actualiza la columna.
- **Integración:**
  - [ ] Conexión a Supabase local desde Vitest.
- **E2E:** No aplica (sin interfaz nueva).
- Commit: `chore(db): configura Supabase local con Docker, clientes SSR y validación de entorno`

#### Paso 1.6 — Integración continua
- [ ] Workflow `ci.yml`:
  - Job `checks`: instalación con caché, lint, typecheck, unit, build.
  - Job `db-e2e`: Supabase CLI, `supabase start`, `supabase db lint`, `supabase test db`, verificación de que los tipos generados no tienen diferencias, tests de integración, Playwright (sube el reporte si falla).
- [ ] Protección de la rama `main` exigiendo CI en verde.
- **Unit / E2E:** No aplica (el pipeline ejecuta las suites existentes).
- Commit: `ci: agrega pipeline de lint, tests unitarios, de BD y E2E`

#### Paso 1.7 — Guía de desarrollo
- [ ] `README.md`: requisitos (Node, pnpm, Docker), cómo levantar el entorno local, comandos, convenciones de commits y de tests.
- Tests: No aplica (documentación).
- Commit: `docs: agrega guía de desarrollo local`

### Fase 2 — Autenticación, usuarios y roles

#### Paso 2.1 — Perfiles y roles en BD
- [ ] Enum `app_role`; tabla `profiles`; trigger que crea el perfil al crear un usuario en `auth.users`.
- [ ] Funciones `current_app_role()` y `has_role(roles[])` (`security definer`, `search_path` fijo).
- [ ] RLS: cada usuario lee su perfil; admin lee y edita todos.
- [ ] Seed: un usuario de prueba por rol.
- **Unit:** No aplica (lógica en SQL).
- **BD:**
  - [ ] El trigger crea el perfil.
  - [ ] `has_role` devuelve lo correcto por rol; un usuario inactivo no pasa `has_role`.
  - [ ] Ventas/logística no leen ni editan perfiles ajenos ni cambian su propio rol; admin sí.
- **E2E:** No aplica (sin interfaz).
- Commit: `feat(auth): agrega perfiles, roles y políticas RLS base`

#### Paso 2.2 — Login y protección de rutas ⛔ P31
- [ ] Página `/login` (email + contraseña), logout y recuperación de contraseña.
- [ ] Middleware/proxy de Next.js que refresca la sesión y redirige a `/login`; usuarios inactivos bloqueados.
- [ ] Fixture de Playwright `loginAs(role)` con `storageState` por rol.
- **Unit:**
  - [ ] Esquema zod del login.
  - [ ] El formulario muestra errores de validación y de credenciales.
- **E2E:**
  - [ ] Login correcto con cada rol → dashboard.
  - [ ] Credenciales incorrectas → mensaje de error.
  - [ ] Ruta protegida sin sesión → redirige a `/login`.
  - [ ] Logout.
  - [ ] Usuario desactivado no puede entrar.
  - [ ] `@mobile` login.
- Commit: `feat(auth): agrega login, logout y protección de rutas`

#### Paso 2.3 — Matriz de permisos ⛔ P30
- [ ] `src/domain/permissions.ts`: `can(role, action)` según la matriz acordada.
- [ ] Helpers de servidor `requireUser()` / `requirePermission()` para Server Actions y páginas; el menú filtra módulos por rol.
- **Unit:**
  - [ ] Test de tabla que recorre **toda** la matriz rol × acción.
  - [ ] `requirePermission` lanza error de acceso denegado.
- **E2E:**
  - [ ] Logística no ve "Usuarios", "Configuración" ni "Cotizaciones" en el menú y recibe 403 al entrar por URL.
  - [ ] Admin ve todos los módulos.
- Commit: `feat(auth): agrega matriz de permisos por rol`

#### Paso 2.4 — Gestión de usuarios (admin)
- [ ] Listado de usuarios; invitar/crear (API de admin con clave secreta, solo servidor); cambiar rol; activar/desactivar; reenviar acceso.
- **Unit:**
  - [ ] Esquema zod del usuario.
  - [ ] La acción rechaza a quien no es admin (dependencias simuladas).
- **Integración:**
  - [ ] Crear usuario crea su perfil con el rol correcto.
- **E2E:**
  - [ ] Admin crea un usuario de logística → ese usuario inicia sesión (vía Mailpit o contraseña temporal).
  - [ ] Admin desactiva un usuario → ya no puede entrar.
  - [ ] Ventas no accede a `/usuarios`.
- Commit: `feat(usuarios): agrega gestión de usuarios para administradores`

### Fase 3 — Auditoría

#### Paso 3.1 — Registro de auditoría en BD
- [ ] Tabla `audit_log` de solo inserción (sin update/delete por RLS).
- [ ] Trigger genérico `audit.log_change()` que guarda solo las columnas cambiadas y el actor (`auth.uid()`; vacío = "Sistema/Shopify").
- [ ] Helper SQL para activar la auditoría en cada tabla nueva (se aplica desde `profiles` en adelante).
- **Unit:**
  - [ ] Función que convierte un diff en texto legible (p. ej., "Taller: Taller A → Taller B").
- **BD:**
  - [ ] Insert, update y delete generan una fila con el diff correcto.
  - [ ] El actor es el usuario autenticado.
  - [ ] Nadie puede modificar ni borrar `audit_log`; solo admin puede leerlo.
- **E2E:** No aplica (la interfaz llega en 3.2).
- Commit: `feat(auditoria): agrega registro automático de cambios en BD`

#### Paso 3.2 — Interfaz de auditoría
- [ ] Página `/auditoria` (admin): filtros por usuario, entidad, acción y fechas; paginación.
- [ ] Componente `EntityHistory` reutilizable (pestaña "Historial" en restauración, pieza, cliente, taller).
- **Unit:**
  - [ ] `EntityHistory` renderiza cambios legibles.
  - [ ] Los filtros se serializan y leen desde la URL.
- **E2E:**
  - [ ] Admin cambia el rol de un usuario → el cambio aparece en `/auditoria` con su nombre y fecha.
  - [ ] Un usuario que no es admin no accede a `/auditoria`.
- Commit: `feat(auditoria): agrega vista de auditoría e historial por entidad`

### Fase 4 — Integración con Shopify (base)

#### Paso 4.1 — Spike técnico en la tienda de desarrollo ⛔ P08 ⛔ P09 ⛔ P10 ⛔ P11 ⛔ P14
Objetivo: validar con llamadas reales antes de construir.
- [ ] Crear cliente persona y empresa (cómo guardar RUC y razón social).
- [ ] Crear una orden con líneas personalizadas y pago pendiente (comparar `orderCreate` vs. borrador de orden + completar).
- [ ] Registrar un pago parcial y luego el total por el canal que usa la tienda (admin, POS y/o API) y ver qué webhooks llegan.
- [ ] Editar una orden (quitar línea / cambiar precio) con Order Editing.
- [ ] Buscar clientes y productos (paginación, variantes, imágenes).
- [ ] Documentar resultados y decisiones en `Notas.md`; guardar payloads reales anonimizados como fixtures en `tests/fixtures/shopify/`.
- Tests: No aplica (exploratorio); los fixtures alimentan los tests de los pasos siguientes.
- Commit: `docs(shopify): documenta resultados del spike y agrega fixtures`

#### Paso 4.2 — Puerto `ShopifyGateway` y adaptadores
- [ ] Interfaz: `createCustomer`, `updateCustomer`, `searchCustomers`, `getCustomer`, `createOrder`, `findOrderByTag`, `getOrderFinancials`, `editOrder`, `searchProducts`, `getProduct`.
- [ ] Adaptador `live`: cliente GraphQL (fetch, versión de API fijada, timeout, reintentos con backoff ante throttling y 5xx, `userErrors` → errores de dominio tipados).
- [ ] Adaptador `fake` en memoria + ruta `/api/test/shopify` (inspeccionar, resetear, forzar errores; 404 fuera del modo fake).
- [ ] Factory que elige el adaptador según `SHOPIFY_MODE`.
- **Unit (MSW + fixtures del spike):**
  - [ ] Mapeo de respuestas a tipos del dominio.
  - [ ] `userErrors` → error tipado.
  - [ ] Reintenta ante `THROTTLED` y 5xx; no reintenta ante 4xx.
  - [ ] Paginación de búsquedas.
  - [ ] **Contract test** compartido: `fake` y `live` (con MSW) cumplen la misma suite.
- **E2E:** No aplica (sin interfaz). Opcional `@shopify-live`: contract test contra la tienda de desarrollo.
- Commit: `feat(shopify): agrega puerto ShopifyGateway con adaptadores live y fake`

#### Paso 4.3 — Outbox de sincronización ⛔ P02
- [ ] Tabla `shopify_sync_jobs` + función SQL para encolar (la usan triggers y RPCs).
- [ ] Procesador idempotente con bloqueo (`FOR UPDATE SKIP LOCKED`), reintentos con backoff y máximo de intentos.
- [ ] Ejecución inmediata tras la acción del usuario (`after()`) + cron `/api/cron/shopify-sync` protegido con `CRON_SECRET`.
- [ ] Componente `SyncStatus` (Sincronizado / Pendiente / Error + botón "Reintentar").
- **Unit:**
  - [ ] Cálculo del backoff.
  - [ ] El procesador marca `ok`/`error` y respeta el máximo de intentos (gateway simulado).
  - [ ] El endpoint de cron rechaza peticiones sin el secreto.
- **BD:**
  - [ ] Dos procesadores concurrentes no toman el mismo job.
  - [ ] Solo admin y el servidor ven los jobs.
- **Integración:**
  - [ ] Job pendiente → procesado con el fake → estado `ok`.
- **E2E:** se cubre en 6.2 (error forzado → "Reintentar" → sincronizado).
- Commit: `feat(shopify): agrega outbox de sincronización con reintentos`

#### Paso 4.4 — Endpoint de webhooks
- [ ] Route Handler `/api/webhooks/shopify`: lee el body crudo, verifica HMAC (comparación en tiempo constante), valida el dominio de la tienda, guarda el evento en `shopify_webhook_events` (único por `X-Shopify-Webhook-Id`), responde 200 rápido y procesa con `after()`.
- [ ] Router por topic (los handlers de pagos se implementan en 11.2).
- [ ] Script `pnpm shopify:webhook <topic> <fixture>` que firma y envía un webhook al entorno local.
- [ ] Script `pnpm shopify:register-webhooks` (por entorno).
- **Unit:**
  - [ ] HMAC válido, inválido y con body alterado.
  - [ ] Topic desconocido → se registra y se ignora.
- **Integración:**
  - [ ] El mismo webhook enviado dos veces se procesa una sola vez.
- **E2E (API con `request` de Playwright):**
  - [ ] Firma inválida → 401.
  - [ ] Firma válida → 200 y evento guardado.
- Commit: `feat(shopify): agrega endpoint de webhooks con verificación HMAC e idempotencia`

### Fase 5 — Configuración y catálogos

#### Paso 5.1 — Configuración de la empresa
- [ ] Tabla `settings` (fila única) + página `/configuracion` (admin): razón social, RUC, dirección, teléfonos, email, logo, vigencia de cotización por defecto, términos y condiciones, plantilla del mensaje de WhatsApp, % mínimo de adelanto.
- **Unit:**
  - [ ] Esquema zod (RUC válido, días > 0, % entre 0 y 100).
- **BD:**
  - [ ] Solo admin edita; todos los usuarios autenticados leen.
- **E2E:**
  - [ ] Admin cambia la vigencia por defecto y sube el logo → persiste al recargar.
  - [ ] Ventas no accede a `/configuracion`.
- Commit: `feat(configuracion): agrega configuración de la empresa`

#### Paso 5.2 — Talleres
- [ ] CRUD de talleres (nombre, contacto, teléfono, dirección, notas, activo). Los inactivos no se pueden asignar pero se conservan en el historial. Auditoría activa.
- **Unit:**
  - [ ] Esquema zod y formulario.
- **BD:**
  - [ ] RLS según la matriz de permisos.
  - [ ] Nombre único sin distinguir mayúsculas.
  - [ ] No se puede borrar un taller con piezas (solo desactivar).
- **E2E:**
  - [ ] Crear, editar y desactivar un taller.
  - [ ] Nombre duplicado muestra error.
  - [ ] `@mobile` crear taller.
- Commit: `feat(talleres): agrega gestión de talleres`

#### Paso 5.3 — Catálogos de materiales y servicios ⛔ P22
- [ ] Si se confirman listas: CRUD simple (nombre, activo; precio sugerido opcional para servicios).
- **Unit / BD / E2E:** análogos a 5.2.
- Commit: `feat(catalogos): agrega catálogos de materiales y servicios`

### Fase 6 — Clientes y contactos

#### Paso 6.1 — Esquema y validaciones ⛔ P27
- [ ] Tablas `clients` y `contacts` + RLS + auditoría + índices de búsqueda (`pg_trgm` sobre nombre, documento, teléfono, email).
- [ ] Esquemas zod: persona (nombres, apellidos, DNI / CE / pasaporte) y empresa (razón social, RUC); teléfono peruano; email.
- **Unit:**
  - [ ] DNI (8 dígitos), RUC (11 dígitos, prefijo válido y dígito verificador), teléfono, email.
  - [ ] Normalización (espacios, mayúsculas, teléfono en formato E.164 `+51...`).
- **BD:**
  - [ ] Documento único por tipo.
  - [ ] Un contacto siempre pertenece a un cliente.
  - [ ] RLS por rol.
- **E2E:** No aplica (la interfaz llega en 6.2).
- Commit: `feat(clientes): agrega esquema de clientes y contactos`

#### Paso 6.2 — Alta de cliente sincronizada con Shopify ⛔ P14
- [ ] Diálogo "Nuevo cliente" (persona / empresa) reutilizable desde cualquier formulario.
- [ ] Al guardar: se crea en BD y se encola `customer_create`; si Shopify indica que el email/teléfono ya existe, se **vincula** al cliente existente en lugar de duplicarlo.
- [ ] Empresa: RUC y razón social en los campos/metacampos definidos en el spike.
- **Unit:**
  - [ ] Mapeo cliente → input de Shopify (persona y empresa).
  - [ ] Manejo de "ya existe" → vinculación.
- **Integración:**
  - [ ] Crear cliente → job `ok` → `shopify_customer_id` guardado (fake).
- **E2E:**
  - [ ] Crear persona y empresa → aparecen como "Sincronizado" y el fake recibió los datos correctos.
  - [ ] Error forzado en el fake → "Error de sincronización" → "Reintentar" → sincronizado.
  - [ ] `@mobile` crear cliente.
- Commit: `feat(clientes): registra clientes y los sincroniza con Shopify`

#### Paso 6.3 — Buscador unificado `ClientPicker`
- [ ] Busca en la BD local (clientes y contactos) y en Shopify (clientes aún no importados); al elegir uno de Shopify se guarda/actualiza localmente.
- [ ] Muestra tipo, documento, teléfono y, si es un contacto, la empresa a la que pertenece.
- [ ] Debounce, estados de carga y vacío, opción "Crear nuevo".
- **Unit:**
  - [ ] Fusión y deduplicación de resultados locales y de Shopify.
  - [ ] Componente: navegación con teclado, selección, "Crear nuevo".
- **E2E:**
  - [ ] Buscar por nombre, documento y teléfono.
  - [ ] Elegir un cliente que solo existe en Shopify (fake) → queda guardado localmente.
- Commit: `feat(clientes): agrega buscador unificado de clientes y contactos`

#### Paso 6.4 — Contactos
- [ ] Alta, edición y desactivación de contactos dentro del cliente y desde el formulario de restauración.
- **Unit:**
  - [ ] Esquema y formulario.
- **BD:**
  - [ ] RLS por rol.
- **E2E:**
  - [ ] Agregar un contacto a una empresa y luego seleccionarlo en el buscador.
- Commit: `feat(clientes): agrega gestión de contactos`

#### Paso 6.5 — Listado y detalle de clientes ⛔ P16
- [ ] `/clientes`: tabla con búsqueda y filtros (tipo, estado de sincronización).
- [ ] `/clientes/[id]`: datos, contactos, restauraciones, cotizaciones, historial; edición (sincroniza con Shopify según P16).
- **Unit:**
  - [ ] Columnas de la tabla y vista de tarjetas en móvil.
- **E2E:**
  - [ ] Buscar un cliente y abrir su detalle.
  - [ ] Editar datos → se encola la actualización en Shopify.
- Commit: `feat(clientes): agrega listado y detalle de clientes`

#### Paso 6.6 — Importación inicial de clientes de Shopify ⛔ P15
- [ ] Script / acción de admin que pagina los clientes de Shopify y los inserta o actualiza (idempotente por `shopify_customer_id`).
- **Unit:**
  - [ ] Mapeo y upsert idempotente.
- **Integración:**
  - [ ] Ejecutar dos veces no duplica clientes.
- **E2E:** No aplica (tarea administrativa puntual).
- Commit: `feat(clientes): agrega importación inicial de clientes desde Shopify`

### Fase 7 — Restauraciones: registro y cotización por WhatsApp

#### Paso 7.1 — Esquema de restauraciones y piezas ⛔ P24 ⛔ P30
- [ ] Enums (estado general, estado de pieza, ubicación, estado de pago, tipo de pago); tablas `restorations` y `pieces`; códigos correlativos (`RES-000001`, pieza `RES-000001-1`); RLS; auditoría; índices.
- [ ] Restricciones: precio ≥ 0, peso ≥ 0; total = suma de precios de piezas no anuladas (trigger).
- **Unit:** No aplica (SQL).
- **BD:**
  - [ ] Códigos correlativos únicos.
  - [ ] Total recalculado al insertar, editar y anular piezas.
  - [ ] RLS por rol (incluida la visibilidad de precios para logística según P30).
- **E2E:** No aplica (sin interfaz).
- Commit: `feat(restauraciones): agrega esquema de restauraciones y piezas`

#### Paso 7.2 — Dominio: dinero y validaciones ⛔ P22 ⛔ P28
- [ ] `src/domain/money.ts` (céntimos enteros, suma, redondeo, formato).
- [ ] Esquemas zod de restauración y pieza (campos según P22).
- **Unit:**
  - [ ] Sumas sin errores de punto flotante (0.1 + 0.2).
  - [ ] Redondeo a 2 decimales.
  - [ ] Validaciones de pieza (precio requerido, peso según P22, longitudes máximas).
  - [ ] Adelanto: requerido en "A cuenta" (≥ % mínimo), 0 en "Crédito", igual al total en "Contado".
- **E2E:** No aplica (lógica pura).
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

#### Paso 7.4 — Formulario de registro ⛔ P20 ⛔ P22
- [ ] `/restauraciones/nueva`: cliente (`ClientPicker`) + contacto opcional, tipo de pago y adelanto, notas.
- [ ] Lista dinámica de piezas (agregar, duplicar, quitar). Por pieza: taller (opcional según P22), descripción, medida, material, peso, servicio, precio y casilla "La pieza ya está en tienda" (marca `arrived_at`).
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
- Commit: `feat(restauraciones): genera mensaje de cotización para WhatsApp`

#### Paso 7.6 — Detalle de restauración ⛔ P30
- [ ] `/restauraciones/[id]`: cabecera (código, cliente, contacto, estado general, estado de pago, total / pagado / saldo, orden de Shopify con enlace), piezas en tarjetas con estado y ubicación, pestañas Piezas, Pagos, Archivos e Historial.
- **Unit:**
  - [ ] Badges por estado y ubicación.
  - [ ] Resumen de montos.
- **E2E:**
  - [ ] El detalle muestra los datos registrados.
  - [ ] Logística ve el detalle sin precios (según P30).
  - [ ] `@mobile` legible sin scroll horizontal.
- Commit: `feat(restauraciones): agrega vista de detalle`

#### Paso 7.7 — Edición de restauraciones y piezas ⛔ P12
- [ ] Editar datos de la restauración y de sus piezas; agregar piezas a una restauración existente.
- [ ] Reglas de qué campos se pueden editar según estado y rol (p. ej., precio bloqueado tras crear la orden, según P12).
- **Unit:**
  - [ ] `editableFields(piece, role)` para cada estado.
- **BD:**
  - [ ] El trigger/RPC impide editar campos bloqueados.
- **E2E:**
  - [ ] Editar descripción y precio antes de aprobar.
  - [ ] Campo bloqueado después de crear la orden.
  - [ ] El cambio aparece en el historial.
- Commit: `feat(restauraciones): permite editar restauraciones y piezas`

### Fase 8 — Estados, ubicación, fechas y tiempos

#### Paso 8.1 — Máquina de estados de la pieza (dominio) ⛔ P17 ⛔ P30
- [ ] `src/domain/piece-state-machine.ts`: estados, transiciones de §7.1, requisitos (nota, taller), roles permitidos, `availableTransitions(piece, role)` y `applyTransition()` (devuelve el nuevo estado, las fechas y efectos como "Aprobada → Recibida si ya llegó").
- **Unit:**
  - [ ] Test de tabla que recorre **todas** las combinaciones estado origen × destino × rol (válidas e inválidas).
  - [ ] Llegada anticipada: aprobar una pieza que ya llegó la deja en Recibida.
  - [ ] Nota obligatoria donde corresponde.
  - [ ] Taller obligatorio al enviar al taller.
  - [ ] Anulada es estado final.
- **E2E:** No aplica (lógica pura).
- Commit: `feat(piezas): agrega máquina de estados de piezas`

#### Paso 8.2 — Derivaciones (dominio) ⛔ P18 ⛔ P19 ⛔ P23
- [ ] `deriveRestorationStatus(pieces)` (§7.3), `deriveLocation(piece)` (§7.2), `daysInWorkshop(history, now)`, `fulfillmentDays(piece, now)`, `isReadyForShopifyOrder(pieces)`.
- [ ] Escenarios en un fixture JSON compartido (se reutiliza en 8.3 contra la BD).
- **Unit:**
  - [ ] Cada regla de §7.3 y su precedencia (con piezas anuladas, mezcla de estados, todas anuladas, retroceso por observación).
  - [ ] Ubicación para cada estado con y sin `arrived_at`.
  - [ ] Días en taller con varios viajes, en curso, cruzando medianoche en Lima vs. UTC, cambio de mes.
  - [ ] Días de cumplimiento.
  - [ ] `isReadyForShopifyOrder` con piezas en consulta, aprobadas y anuladas.
- **E2E:** No aplica (lógica pura).
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
  - [ ] Flujo de consulta: En consulta → En espera de respuesta → Aprobada.
  - [ ] Pieza que llegó antes de aprobarse pasa a Recibida al aprobarla.
  - [ ] Observada y reenvío al taller.
  - [ ] Anular todas las piezas → restauración Anulada.
  - [ ] Cada rol solo ve las acciones que le corresponden.
  - [ ] `@mobile` cambio de estado desde el celular.
- Commit: `feat(piezas): agrega acciones de cambio de estado en la interfaz`

#### Paso 8.5 — Línea de tiempo
- [ ] `Timeline` por pieza (estado, fecha, usuario, nota) y resumen por restauración; muestra días en taller y días de cumplimiento.
- **Unit:**
  - [ ] Render de eventos y de días "en curso".
- **E2E:**
  - [ ] Tras varios cambios, la línea de tiempo muestra usuarios y notas en orden.
- Commit: `feat(piezas): agrega línea de tiempo de estados`

### Fase 9 — Orden automática en Shopify

#### Paso 9.1 — Creación de la orden al aprobar ⛔ P10 ⛔ P11 ⛔ P13
- [ ] Handler del job `order_create`: primero busca una orden con la etiqueta única de la restauración (evita duplicados si hubo un corte); crea la orden (método elegido en el spike) con el cliente, una línea por pieza no anulada, precios, etiquetas (`restauracion`, código) y nota con el enlace al sistema; guarda `shopify_order_id` y `shopify_order_name`.
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

#### Paso 9.2 — Cambios posteriores a la orden ⛔ P12
- [ ] Según la respuesta: anular una pieza, cambiar un precio o agregar una pieza después de crear la orden → edición de la orden vía Order Editing (encolado), o bloqueo + aviso para ajuste manual.
- **Unit:**
  - [ ] Cálculo del cambio (líneas a quitar o ajustar).
- **Integración:**
  - [ ] Anular pieza → job `order_edit` → total actualizado en el fake.
- **E2E:**
  - [ ] Anular una pieza de una restauración aprobada → total y orden actualizados (o aviso, según la decisión).
- Commit: `feat(shopify): sincroniza cambios de piezas con la orden`

### Fase 10 — Fotos y archivos

#### Paso 10.1 — Storage y datos ⛔ P32
- [ ] Bucket privado `piece-files` con rutas `restorations/{id}/pieces/{id}/...`; políticas de Storage por rol; tabla `piece_files`; URLs firmadas de corta duración.
- **Unit:** No aplica (políticas en SQL).
- **BD:**
  - [ ] Un usuario sin permiso no puede leer ni subir.
  - [ ] Borrar un archivo requiere el rol acordado y elimina el objeto.
- **E2E:** se cubre en 10.2.
- Commit: `feat(archivos): agrega almacenamiento de archivos por pieza`

#### Paso 10.2 — Subida y galería
- [ ] `FileUploader`: varios archivos, cámara del celular (`capture`), compresión de imágenes en el navegador, tipos y tamaño máximos (P32), progreso y reintento.
- [ ] Clasificación Antes / Después / Documento; galería con visor y comparación antes/después; descarga; eliminar.
- **Unit:**
  - [ ] Validación de tipo y tamaño.
  - [ ] La compresión se aplica solo a imágenes.
  - [ ] Agrupación por clasificación.
- **E2E:**
  - [ ] Subir 2 fotos "Antes" y 1 PDF → aparecen en la galería.
  - [ ] Archivo no permitido → mensaje de error.
  - [ ] Eliminar un archivo.
  - [ ] `@mobile` subir foto.
- Commit: `feat(archivos): agrega subida de fotos y documentos con galería`

### Fase 11 — Pagos

#### Paso 11.1 — Esquema y estado de pago ⛔ P29
- [ ] Tabla `payments` (única por id de transacción de Shopify); función que recalcula pagado, saldo y estado de pago de la restauración.
- [ ] Dominio `derivePaymentStatus(total, paid)`.
- **Unit:**
  - [ ] Pendiente, Parcial y Pagado; sobrepago; reembolso total y parcial; total 0.
- **BD:**
  - [ ] Recálculo al insertar o actualizar pagos.
  - [ ] RLS (visibilidad de logística según P30).
- **E2E:** se cubre en 11.2.
- Commit: `feat(pagos): agrega registro de pagos y estado de pago`

#### Paso 11.2 — Webhooks de pagos ⛔ P09
- [ ] Handlers para `orders/paid`, `orders/updated`, `order_transactions/create` y `refunds/create` (según el spike): identifican la restauración por `shopify_order_id`, **consultan a Shopify el resumen financiero actual de la orden** (fuente de verdad, inmune a webhooks desordenados) y hacen upsert de las transacciones.
- [ ] Las órdenes que no son de restauraciones se ignoran.
- **Unit:**
  - [ ] Parseo de los fixtures reales del spike.
  - [ ] Mapeo transacción → pago (tipos venta/captura/reembolso; estados éxito/fallo).
- **Integración:**
  - [ ] Webhook de pago parcial → estado Parcial.
  - [ ] Segundo pago → Pagado.
  - [ ] Webhooks duplicados o desordenados → resultado correcto.
  - [ ] Reembolso → recalcula saldo y estado.
- **E2E:**
  - [ ] Con una restauración aprobada, enviar un webhook firmado de adelanto → la interfaz muestra pagado, saldo y "Parcial".
  - [ ] Pago del saldo → "Pagado".
- Commit: `feat(pagos): recibe pagos de Shopify mediante webhooks`

#### Paso 11.3 — Interfaz de pagos
- [ ] Pestaña Pagos (historial, método, fecha); resumen en la cabecera; badge de estado de pago en listados; botón "Resincronizar pagos" (admin).
- **Unit:**
  - [ ] Componentes de resumen e historial.
- **E2E:**
  - [ ] El historial de pagos es visible.
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
- [ ] `/piezas`: todas las piezas con filtros por ubicación, estado, taller y días en taller (> N); acciones masivas (enviar al taller, marcar devueltas); resaltado de piezas con muchos días en taller.
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

#### Paso 13.2 — Interfaz del dashboard ⛔ P30
- [ ] KPIs en tarjetas; gráficos (barras por estado, línea de ventas, barras de días por taller); selector de rango de fechas; accesos rápidos (piezas con más de N días en taller, restauraciones listas para entregar); visibilidad por rol.
- **Unit:**
  - [ ] Transformación de datos para los gráficos.
  - [ ] Tarjetas con formato de soles y días.
- **E2E:**
  - [ ] Con datos semilla, los KPIs muestran los valores esperados.
  - [ ] Cambiar el rango de fechas actualiza las métricas.
  - [ ] Cada rol ve solo las métricas permitidas.
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

#### Paso 16.1 — Supabase Cloud ⛔ P02 ⛔ P05
- [ ] Proyecto en región cercana (`sa-east-1`); Auth (registro deshabilitado, SMTP propio, URLs de redirección); buckets; `supabase link`.
- [ ] Workflow `deploy-db.yml`: en push a `main`, `supabase db push` con aprobación manual (environment protegido).
- [ ] Backups según el plan contratado.
- Tests: la migración se valida antes en CI con `supabase db reset` + `supabase test db`.
- Commit: `ci: agrega despliegue de migraciones a producción`

#### Paso 16.2 — Vercel ⛔ P03 ⛔ P04
- [ ] Proyecto, variables de entorno de producción, dominio, Vercel Cron para `/api/cron/shopify-sync`, previews según P03.
- Tests: smoke tests de 16.5.
- Commit: `chore(deploy): configura Vercel y cron`

#### Paso 16.3 — Shopify en producción
- [ ] App en la tienda real con los scopes mínimos; token en Vercel; `pnpm shopify:register-webhooks` apuntando a producción.
- [ ] Verificación manual con checklist (cliente de prueba, orden, pago parcial, pago total, reembolso, anulación) y limpieza de los datos de prueba.
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
| H4 | 11–13 | Pagos por webhook, listados, dashboard |
| H5 | 14 | Cotizador con PDF |
| H6 | 15–17 | Producción, capacitación y entrega |

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Registrar pagos parciales ("A cuenta") en Shopify puede no ser directo según el canal de cobro | Validar en el spike (4.1); alternativa: registrar el pago desde el sistema vía API ⛔ P09 |
| El adelanto se cobra antes de que exista la orden (la orden se crea al aprobar) | Decisión en ⛔ P10 |
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
