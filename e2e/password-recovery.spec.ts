import { expect, test } from "./fixtures";
import {
  createTestUser,
  deleteTestUser,
  latestEmailLink,
} from "./support/supabase";

test("recupera la contraseña con el enlace del correo", async ({ page }) => {
  const user = await createTestUser("ventas", "Clave-original-123");
  try {
    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page).toHaveURL(/\/recuperar-contrasena$/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByRole("status")).toContainText(
      "te enviamos un enlace",
    );

    await page.goto(await latestEmailLink(user.email));
    await expect(page).toHaveURL(/\/restablecer-contrasena$/);
    await page.getByLabel("Nueva contraseña").fill("Clave-nueva-456");
    await page.getByLabel("Repite la contraseña").fill("Clave-nueva-456");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contraseña").fill("Clave-nueva-456");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await deleteTestUser(user.id);
  }
});

test("un enlace inválido lleva al login con un aviso", async ({ page }) => {
  await page.goto(
    "/auth/confirm?token_hash=invalido&type=recovery&next=/restablecer-contrasena",
  );
  await expect(page).toHaveURL(/\/login\?motivo=enlace-invalido$/);
  await expect(page.getByRole("status")).toContainText(
    "El enlace no es válido",
  );
});
