import { expect, test } from "./fixtures";
import {
  createTestUser,
  deleteTestUser,
  setUserActive,
} from "./support/supabase";
import { SEED_PASSWORD, SEED_USERS } from "./support/users";

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test.describe("Inicio de sesión", () => {
  for (const [role, user] of Object.entries(SEED_USERS)) {
    test(`${role} inicia sesión y llega al dashboard`, async ({ page }) => {
      await page.goto("/login");
      await login(page, user.email, SEED_PASSWORD);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole("button", { name: new RegExp(user.fullName) }),
      ).toBeVisible();
    });
  }

  test("la página de login no tiene violaciones graves de accesibilidad @smoke", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto("/login");
    const { violations } = await makeAxeBuilder().analyze();
    expect(
      violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
    ).toEqual([]);
  });

  test("con credenciales incorrectas muestra un error", async ({ page }) => {
    await page.goto("/login");
    await login(page, SEED_USERS.ventas.email, "incorrecta");
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "Email o contraseña incorrectos.",
    );
    await expect(page).toHaveURL(/\/login$/);
  });

  test("una ruta protegida sin sesión lleva al login y vuelve tras ingresar", async ({
    page,
  }) => {
    await page.goto("/clientes");
    await expect(page).toHaveURL(/\/login\?next=%2Fclientes$/);
    await login(page, SEED_USERS.ventas.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/clientes$/);
  });

  test("cerrar sesión vuelve al login y protege las rutas", async ({
    page,
  }) => {
    await page.goto("/login");
    await login(page, SEED_USERS.logistica.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: /Logística de prueba/ }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("un usuario desactivado no puede ingresar", async ({ page }) => {
    const password = "Clave-de-prueba-123";
    const user = await createTestUser("ventas", password);
    try {
      await setUserActive(user.id, false);
      await page.goto("/login");
      await login(page, user.email, password);
      await expect(page.locator("form").getByRole("alert")).toContainText(
        "Tu usuario está desactivado",
      );
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("si lo desactivan con la sesión abierta, lo saca del sistema", async ({
    page,
  }) => {
    const password = "Clave-de-prueba-123";
    const user = await createTestUser("ventas", password);
    try {
      await page.goto("/login");
      await login(page, user.email, password);
      await expect(page).toHaveURL(/\/dashboard$/);

      await setUserActive(user.id, false);
      await page.goto("/clientes");
      await expect(page).toHaveURL(/\/login\?motivo=inactivo$/);
      await expect(page.getByRole("status")).toContainText(
        "Tu usuario está desactivado",
      );
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("inicia sesión desde el celular @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await page.goto("/login");
    await login(page, SEED_USERS.ventas.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
