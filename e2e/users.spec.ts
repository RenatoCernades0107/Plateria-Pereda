import { expect, test } from "./fixtures";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  latestEmailLink,
} from "./support/supabase";

test.describe("Gestión de usuarios", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("el admin crea un usuario de logística y este activa su cuenta por correo", async ({
    page,
    browser,
  }) => {
    const email = `e2e-nuevo-${Date.now()}@pereda.test`;
    try {
      await page.goto("/usuarios");
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Nombre completo").fill("Lola Logística");
      await dialog.getByLabel("Email").fill(email);
      await dialog.getByRole("combobox").click();
      await page.getByRole("option", { name: "Logística" }).click();
      await dialog
        .getByRole("button", { name: "Crear y enviar acceso" })
        .click();

      await expect(
        page.getByText(`Usuario creado. Enviamos el acceso a ${email}.`),
      ).toBeVisible();
      const fila = page.getByTestId(`usuario-${email}`);
      await expect(fila).toContainText("Lola Logística");
      await expect(
        fila.getByRole("combobox", { name: "Rol de Lola Logística" }),
      ).toHaveText("Logística");

      // El nuevo usuario abre el correo en otro navegador y crea su contraseña.
      const context = await browser.newContext();
      const invitado = await context.newPage();
      await invitado.goto(await latestEmailLink(email));
      await expect(invitado).toHaveURL(/\/restablecer-contrasena$/);
      await invitado.getByLabel("Nueva contraseña").fill("Clave-de-lola-123");
      await invitado
        .getByLabel("Repite la contraseña")
        .fill("Clave-de-lola-123");
      await invitado
        .getByRole("button", { name: "Guardar contraseña" })
        .click();
      await expect(invitado).toHaveURL(/\/piezas$/);
      await expect(
        invitado.getByRole("button", { name: /Lola Logística/ }),
      ).toBeVisible();
      await context.close();
    } finally {
      const { data } = await adminClient()
        .from("profiles")
        .select("id")
        .eq("email", email);
      for (const row of data ?? []) await deleteTestUser(row.id);
    }
  });

  test("el admin cambia el rol y desactiva a un usuario, que ya no puede ingresar", async ({
    page,
    browser,
  }) => {
    const password = "Clave-de-prueba-123";
    const user = await createTestUser("ventas", password);
    try {
      await page.goto("/usuarios");
      const fila = page.getByTestId(`usuario-${user.email}`);

      await fila.getByRole("combobox").click();
      await page.getByRole("option", { name: "Logística" }).click();
      await expect(page.getByText(/ahora es Logística/)).toBeVisible();
      await expect(fila.getByRole("combobox")).toHaveText("Logística");

      await fila.getByRole("button", { name: "Desactivar" }).click();
      await expect(fila).toContainText("Desactivado");
      await expect(fila.getByRole("button", { name: "Activar" })).toBeVisible();

      const context = await browser.newContext();
      const otro = await context.newPage();
      await otro.goto("/login");
      await otro.getByLabel("Email").fill(user.email);
      await otro.getByLabel("Contraseña").fill(password);
      await otro.getByRole("button", { name: "Ingresar" }).click();
      await expect(otro.locator("form").getByRole("alert")).toContainText(
        "Tu usuario está desactivado",
      );
      await context.close();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("el admin no puede cambiar su propio rol ni desactivarse", async ({
    page,
  }) => {
    await page.goto("/usuarios");
    const fila = page.getByTestId("usuario-admin@pereda.test");
    await expect(fila).toContainText("(tú)");
    await expect(fila.getByRole("combobox")).toBeDisabled();
    await expect(
      fila.getByRole("button", { name: "Desactivar" }),
    ).toBeDisabled();
  });

  test("el admin reenvía el acceso por correo", async ({ page }) => {
    const user = await createTestUser("ventas", "Clave-de-prueba-123");
    try {
      await page.goto("/usuarios");
      await page
        .getByTestId(`usuario-${user.email}`)
        .getByRole("button", { name: "Reenviar acceso" })
        .click();
      await expect(
        page.getByText(`Enviamos un enlace de acceso a ${user.email}.`),
      ).toBeVisible();
      expect(await latestEmailLink(user.email)).toContain("type=recovery");
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("la pantalla de usuarios no tiene violaciones graves de accesibilidad", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto("/usuarios");
    const { violations } = await makeAxeBuilder().analyze();
    expect(
      violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
    ).toEqual([]);
  });

  test("en el celular muestra tarjetas con las acciones visibles @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await page.goto("/usuarios");
    const tarjeta = page.getByTestId("usuario-movil-ventas@pereda.test");
    await expect(tarjeta).toBeVisible();
    await expect(
      tarjeta.getByRole("button", { name: "Desactivar" }),
    ).toBeInViewport();
    await expect(page.getByRole("table")).toBeHidden();
  });
});
