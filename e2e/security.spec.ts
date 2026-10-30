import { can, type Permission } from "../src/domain/permissions";
import { ROLE_LABELS, type AppRole } from "../src/lib/roles";
import { expect, test } from "./fixtures";

/**
 * Paso 15.1: cada rol entra por URL a cada módulo; donde no tiene permiso recibe 403
 * (y nunca el contenido). Las rutas con [id] usan un id que no existe: el permiso se
 * revisa antes de buscar el registro.
 */
const ID = "00000000-0000-4000-8000-0000000015e1";

const PAGES: { path: string; needs: Permission[] }[] = [
  { path: "/dashboard", needs: ["dashboard.ver"] },
  { path: "/restauraciones", needs: ["restauraciones.ver"] },
  {
    path: "/restauraciones/nueva",
    needs: ["restauraciones.editar", "cotizaciones-whatsapp.usar"],
  },
  { path: "/piezas", needs: ["restauraciones.ver"] },
  { path: "/piezas/historial", needs: ["restauraciones.ver"] },
  { path: "/cotizaciones-whatsapp", needs: ["cotizaciones-whatsapp.usar"] },
  {
    path: `/cotizaciones-whatsapp/${ID}`,
    needs: ["cotizaciones-whatsapp.usar"],
  },
  {
    path: `/cotizaciones-whatsapp/${ID}/editar`,
    needs: ["cotizaciones-whatsapp.usar"],
  },
  { path: "/clientes", needs: ["clientes.ver"] },
  { path: `/clientes/${ID}`, needs: ["clientes.ver"] },
  { path: "/cotizaciones", needs: ["cotizador.ver"] },
  { path: "/cotizaciones/nueva", needs: ["cotizador.usar"] },
  { path: `/cotizaciones/${ID}`, needs: ["cotizador.ver"] },
  { path: "/talleres", needs: ["talleres.gestionar"] },
  { path: `/talleres/${ID}/piezas`, needs: ["talleres.gestionar"] },
  { path: "/usuarios", needs: ["usuarios.gestionar"] },
  { path: "/configuracion", needs: ["configuracion.gestionar"] },
  { path: "/configuracion/servicios", needs: ["configuracion.gestionar"] },
  { path: "/configuracion/materiales", needs: ["configuracion.gestionar"] },
  {
    path: "/configuracion/metodos-de-pago",
    needs: ["configuracion.gestionar"],
  },
  { path: "/configuracion/sucursales", needs: ["configuracion.gestionar"] },
  { path: "/configuracion/alertas", needs: ["configuracion.gestionar"] },
  { path: "/auditoria", needs: ["auditoria.ver"] },
];

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

const forbiddenFor = (role: AppRole) =>
  PAGES.filter((p) => !p.needs.every((permission) => can(role, permission)));

test.describe("Seguridad: rutas prohibidas por rol", () => {
  for (const role of ROLES) {
    const forbidden = forbiddenFor(role);
    if (forbidden.length === 0) continue;

    test(`${role} recibe 403 en los ${forbidden.length} módulos que no le tocan`, async ({
      page,
      loginAs,
    }) => {
      await loginAs(role);
      for (const { path } of forbidden) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(403);
        await expect(
          page.getByRole("heading", {
            name: "No tienes acceso a esta sección",
          }),
          path,
        ).toBeVisible();
      }
    });
  }

  test("el admin no recibe 403 en ninguna página", () => {
    expect(forbiddenFor("admin")).toEqual([]);
  });

  test("las exportaciones CSV responden 403 a logística y no salen sin sesión", async ({
    page,
    playwright,
    loginAs,
  }) => {
    await loginAs("logistica");
    for (const path of [
      "/api/restauraciones/exportar",
      "/api/dashboard/exportar?area=resumen",
    ]) {
      expect((await page.request.get(path)).status(), path).toBe(403);
    }

    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    for (const path of [
      "/api/restauraciones/exportar",
      "/api/dashboard/exportar?area=resumen",
    ]) {
      // El proxy manda al login antes de llegar a la ruta.
      const response = await anonymous.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers()["location"], path).toContain("/login");
    }
    await anonymous.dispose();
  });

  test("sin sesión, los módulos redirigen al login", async ({ page }) => {
    await page.goto("/usuarios");
    await expect(page).toHaveURL(/\/login\?next=%2Fusuarios$/);
  });

  test("las respuestas llevan las cabeceras de seguridad", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
