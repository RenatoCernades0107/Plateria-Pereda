# Platería Pereda · Sistema de restauraciones y cotizador

Sistema interno para registrar restauraciones (piezas, estados, taller, pagos) y generar cotizaciones, integrado con la tienda de Shopify de Platería Pereda.

- Plan de trabajo paso a paso: [`Todo.md`](./Todo.md)
- Preguntas, respuestas y decisiones: [`Notas.md`](./Notas.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, Storage) · Shopify Admin GraphQL API · Vitest · Playwright · pgTAP.

## Requisitos

- **Node 22** (ver `.nvmrc`) y **pnpm 10** (`corepack enable` instala la versión del proyecto).
- **Docker** en ejecución (Docker Desktop en Windows y macOS), para Supabase local.

## Puesta en marcha

```bash
pnpm install
pnpm db:start     # levanta Supabase local en Docker (la primera vez descarga imágenes)
pnpm env:local    # crea .env.local con la URL y las claves del Supabase local
pnpm dev          # http://localhost:3000
```

`.env.local` no se sube al repositorio. Las variables están documentadas en [`.env.example`](./.env.example); la app valida todas al arrancar y, si falta alguna, muestra cuáles en la consola.

Usuarios de prueba (creados por `supabase/seed.sql`, solo en local), todos con la contraseña `Pereda-local-2026`:

| Email                   | Rol           |
| ----------------------- | ------------- |
| `admin@pereda.test`     | Administrador |
| `ventas@pereda.test`    | Ventas        |
| `logistica@pereda.test` | Logística     |

Servicios locales:

| Servicio                         | URL                                                       |
| -------------------------------- | --------------------------------------------------------- |
| App                              | http://localhost:3000                                     |
| API de Supabase                  | http://127.0.0.1:54321                                    |
| Supabase Studio (explorar la BD) | http://127.0.0.1:54323                                    |
| Mailpit (correos de prueba)      | http://127.0.0.1:54324                                    |
| Postgres                         | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Comandos

| Comando                                   | Qué hace                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                | Servidor de desarrollo                                                                             |
| `pnpm build` / `pnpm start`               | Compilación y servidor de producción                                                               |
| `pnpm lint`                               | ESLint                                                                                             |
| `pnpm typecheck`                          | Tipos de rutas de Next + TypeScript                                                                |
| `pnpm format` / `pnpm format:check`       | Prettier (escribe / solo revisa)                                                                   |
| `pnpm test`                               | Tests unitarios (Vitest)                                                                           |
| `pnpm test:watch`                         | Tests unitarios en modo observación                                                                |
| `pnpm test:coverage`                      | Tests unitarios con cobertura (mínimo 70 % global y 90 % en `src/domain`)                          |
| `pnpm test:int`                           | Tests de integración contra Supabase local                                                         |
| `pnpm test:e2e`                           | Tests E2E (Playwright, escritorio y celular)                                                       |
| `pnpm test:e2e:ui`                        | Tests E2E con la interfaz de Playwright                                                            |
| `pnpm db:start` / `db:stop` / `db:status` | Levantar, detener o ver Supabase local                                                             |
| `pnpm db:reset`                           | Recrea la BD local aplicando migraciones y `supabase/seed.sql`                                     |
| `pnpm db:test`                            | Tests de BD (pgTAP, `supabase/tests`)                                                              |
| `pnpm db:lint`                            | Revisa las funciones SQL                                                                           |
| `pnpm db:types`                           | Regenera `src/lib/supabase/database.types.ts` desde la BD local                                    |
| `pnpm env:local`                          | Crea o actualiza `.env.local` con los datos de Supabase local y un `CRON_SECRET`                   |
| `pnpm shopify:sync`                       | Procesa el outbox de Shopify (con `pnpm dev` corriendo; en producción lo hace Vercel Cron)         |
| `pnpm shopify:webhook <topic> <fixture>`  | Firma y envía un webhook de prueba a la app local (fixtures en `tests/fixtures/shopify/webhooks/`) |
| `pnpm shopify:register-webhooks`          | Suscribe la tienda a los webhooks del sistema (`APP_URL` https del entorno)                        |

## Estructura

```
src/
  app/            rutas (App Router); los módulos viven en app/(app)/
  components/     componentes del proyecto; components/ui/ son los de shadcn
  domain/         lógica de negocio pura (sin Next ni Supabase)
  hooks/          hooks de React
  lib/            utilidades: env, formato, navegación, clientes de Supabase
  server/         server actions y consultas
supabase/         config.toml, migrations/, seed.sql, tests/ (pgTAP)
e2e/              tests de Playwright
tests/            setup, stubs y utilidades de los tests de Vitest
scripts/          scripts de desarrollo
```

## Base de datos

- Cada cambio de esquema es una migración: `pnpm exec supabase migration new <nombre>` y luego editar el archivo en `supabase/migrations/`.
- Después de cambiar el esquema: `pnpm db:reset`, `pnpm db:test` y `pnpm db:types` (el CI falla si los tipos generados no coinciden con las migraciones).
- Las funciones internas van en el esquema `private`, que la API de Supabase no expone.
- El cliente administrador (`src/lib/supabase/admin.ts`) usa la clave secreta y salta RLS: solo en el servidor.

## Tests

| Tipo        | Dónde                  | Herramienta                                                                                      |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Unit        | `src/**/*.test.ts(x)`  | Vitest + Testing Library; la red se simula con MSW y una llamada sin simular hace fallar el test |
| BD          | `supabase/tests/*.sql` | pgTAP                                                                                            |
| Integración | `**/*.int.test.ts`     | Vitest contra Supabase local (la URL y las claves se leen de `supabase status`)                  |
| E2E         | `e2e/*.spec.ts`        | Playwright; `@mobile` también corre en celular, `@smoke` son los de humo                         |

Orden de trabajo en cada paso: tests del dominio primero, migración y tests de BD, implementación, interfaz y E2E.

## Convenciones

- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) en español: `feat(...)`, `fix(...)`, `test(...)`, `chore(...)`, `docs(...)`, `ci(...)`, `perf(...)`. Un commit por cambio o feature.
- El CI (`.github/workflows/ci.yml`) corre en cada push: lint, tipos, formato, tests unitarios, build, tests de BD, integración y E2E.
- Textos de la interfaz en español (Perú); montos en soles y fechas en hora de Lima con `src/lib/format.ts`.

## Entornos especiales

En entornos con red restringida (como el de Claude Code en la nube):

- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chromium` usa un Chromium ya instalado si Playwright no puede descargar el suyo.
- `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` descarga las imágenes de Supabase desde Docker Hub si AWS ECR está bloqueado.
