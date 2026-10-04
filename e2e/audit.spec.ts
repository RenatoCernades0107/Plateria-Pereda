import { formatDate } from "../src/lib/format";
import { expect, test } from "./fixtures";
import { createTestUser, deleteTestUser, userClient } from "./support/supabase";
import { SEED_PASSWORD, SEED_USERS } from "./support/users";

const PASSWORD = "Clave-de-prueba-123";
const uniqueName = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe("Auditoría", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("el cambio de rol que hace el admin aparece en /auditoria con su nombre y la fecha", async ({
    page,
    makeAxeBuilder,
  }) => {
    const nombre = uniqueName("Auditada");
    const user = await createTestUser("ventas", PASSWORD, nombre);
    try {
      await page.goto("/usuarios");
      const fila = page.getByTestId(`usuario-${user.email}`);
      await fila.getByRole("combobox").click();
      await page.getByRole("option", { name: "Logística" }).click();
      await expect(page.getByText(/ahora es Logística/)).toBeVisible();

      await page.goto("/auditoria");
      await page.getByLabel("Usuario").click();
      await page
        .getByRole("option", { name: SEED_USERS.admin.fullName })
        .click();
      await page.getByLabel("Entidad").click();
      await page.getByRole("option", { name: "Usuario" }).click();
      await page.getByLabel("Acción").click();
      await page.getByRole("option", { name: "Edición" }).click();
      await page.getByRole("button", { name: "Filtrar" }).click();
      await expect(page).toHaveURL(
        /\/auditoria\?usuario=[\w-]+&entidad=profiles&accion=update$/,
      );

      const registro = page
        .getByTestId("auditoria-registro")
        .filter({ hasText: nombre });
      await expect(registro).toHaveCount(1);
      await expect(registro).toContainText(SEED_USERS.admin.fullName);
      await expect(registro).toContainText("Rol: Ventas → Logística");
      await expect(registro).toContainText(formatDate(new Date()));

      // Los filtros sobreviven a recargar la página.
      await page.reload();
      await expect(page.getByLabel("Acción")).toHaveText("Edición");
      await expect(registro).toHaveCount(1);

      const results = await makeAxeBuilder().analyze();
      expect(
        results.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact ?? ""),
        ),
      ).toEqual([]);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("la auditoría se lee en el celular @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const nombre = uniqueName("Desactivada");
    const user = await createTestUser("ventas", PASSWORD, nombre);
    try {
      const admin = await userClient(SEED_USERS.admin.email, SEED_PASSWORD);
      const { error } = await admin
        .from("profiles")
        .update({ active: false })
        .eq("id", user.id);
      expect(error).toBeNull();

      await page.goto("/auditoria?entidad=profiles&accion=update");
      const tarjeta = page
        .getByTestId("auditoria-registro-movil")
        .filter({ hasText: nombre })
        .filter({ hasText: SEED_USERS.admin.fullName });
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta).toContainText("Estado: Activo → Desactivado");

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? Infinity,
      );
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
