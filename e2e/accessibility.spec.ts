import type { Page } from "@playwright/test";

import type { AppRole } from "../src/lib/roles";
import { expect, test } from "./fixtures";

/**
 * Paso 15.2: cada página principal, sin violaciones serias de accesibilidad (axe, WCAG
 * 2.1 AA) y sin scroll horizontal en 360 px (celular), 768 px (tablet) y 1280 px
 * (escritorio). Los detalles usan registros del seed.
 */
const SEED = {
  restoration: "30000000-0000-0000-0000-000000000001",
  piece: "40000000-0000-0000-0000-000000000001",
  client: "50000000-0000-0000-0000-000000000003",
  workshop: "20000000-0000-0000-0000-000000000001",
};

const PAGES: { path: string; role: AppRole }[] = [
  { path: "/dashboard", role: "admin" },
  { path: "/restauraciones", role: "ventas" },
  { path: "/restauraciones/nueva", role: "ventas" },
  { path: `/restauraciones/${SEED.restoration}`, role: "admin" },
  { path: "/piezas", role: "logistica" },
  { path: "/piezas/historial", role: "ventas" },
  { path: `/piezas/${SEED.piece}`, role: "logistica" },
  { path: "/cotizaciones-whatsapp", role: "ventas" },
  { path: "/clientes", role: "ventas" },
  { path: `/clientes/${SEED.client}`, role: "ventas" },
  { path: "/cotizaciones", role: "ventas" },
  { path: "/cotizaciones/nueva", role: "ventas" },
  { path: "/talleres", role: "logistica" },
  { path: `/talleres/${SEED.workshop}/piezas`, role: "logistica" },
  { path: "/usuarios", role: "admin" },
  { path: "/configuracion", role: "admin" },
  { path: "/configuracion/servicios", role: "admin" },
  { path: "/configuracion/alertas", role: "admin" },
  { path: "/auditoria", role: "admin" },
];

const WIDTHS = [360, 768, 1280] as const;

async function seriousViolations(
  makeAxeBuilder: () => import("@axe-core/playwright").default,
) {
  const { violations } = await makeAxeBuilder().analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("Accesibilidad y responsive", () => {
  for (const { path, role } of PAGES) {
    test(`${path} (${role})`, async ({ page, loginAs, makeAxeBuilder }) => {
      await loginAs(role);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(path);
        expect(response?.status(), `${path} en ${width} px`).toBe(200);
        await expect(
          page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        expect(
          await horizontalOverflow(page),
          `scroll horizontal en ${width} px`,
        ).toBeLessThanOrEqual(0);
        // axe en el celular y en el escritorio (el menú y las tablas cambian).
        if (width !== 768) {
          expect(
            await seriousViolations(makeAxeBuilder),
            `axe en ${width} px`,
          ).toEqual([]);
        }
      }
    });
  }

  test("el login es accesible y cabe en el celular", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/login");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await seriousViolations(makeAxeBuilder)).toEqual([]);
  });

  test("con el teclado se salta el menú y se llega al contenido", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await page.goto("/restauraciones");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#contenido")).toBeFocused();
    // El siguiente Tab ya está dentro del contenido, no en el menú.
    await page.keyboard.press("Tab");
    const inContent = await page.evaluate(() =>
      Boolean(document.activeElement?.closest("#contenido")),
    );
    expect(inContent).toBe(true);
  });
});
