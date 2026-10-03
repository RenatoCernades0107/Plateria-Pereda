import path from "node:path";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

const LOGO = path.join(__dirname, "..", "public", "logo-pereda.png");

test.describe("Configuración", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("el admin cambia la vigencia por defecto y sube el logo; persiste al recargar", async ({
    page,
    makeAxeBuilder,
  }) => {
    const admin = adminClient();
    const { data: original } = await admin
      .from("settings")
      .select("*")
      .single();
    try {
      await page.goto("/configuracion");
      const vigencia = page.getByLabel("Vigencia por defecto (días)");
      await vigencia.fill("21");
      await page.getByLabel("RUC").fill("20100047218");
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByText("Configuración guardada.")).toBeVisible();

      await page.getByLabel("Archivo del logo").setInputFiles(LOGO);
      await expect(page.getByText("Logo actualizado.")).toBeVisible();
      const logo = page.getByRole("img", { name: "Logo de la empresa" });
      await expect(logo).toHaveAttribute("src", /\/branding\/logo\//);

      await page.reload();
      await expect(vigencia).toHaveValue("21");
      await expect(page.getByLabel("RUC")).toHaveValue("20100047218");
      await expect(logo).toBeVisible();
      expect(
        await logo.evaluate((img: HTMLImageElement) => img.naturalWidth),
      ).toBeGreaterThan(0);

      const results = await makeAxeBuilder().analyze();
      expect(
        results.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact ?? ""),
        ),
      ).toEqual([]);
    } finally {
      const { data: current } = await admin
        .from("settings")
        .select("logo_path")
        .single();
      if (current?.logo_path) {
        await admin.storage.from("branding").remove([current.logo_path]);
      }
      if (original)
        await admin.from("settings").update(original).eq("id", true);
    }
  });

  test("un RUC inválido no se guarda", async ({ page }) => {
    await page.goto("/configuracion");
    await page.getByLabel("RUC").fill("20100047219");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Ingresa un RUC válido")).toBeVisible();
    await expect(page.getByText("Configuración guardada.")).toHaveCount(0);
  });
});
