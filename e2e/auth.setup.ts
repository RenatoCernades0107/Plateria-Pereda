import { expect, test as setup } from "@playwright/test";

import type { AppRole } from "../src/lib/roles";
import { SEED_PASSWORD, SEED_USERS, storageStatePath } from "./support/users";

for (const role of Object.keys(SEED_USERS) as AppRole[]) {
  setup(`sesión de ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(SEED_USERS[role].email);
    await page.getByLabel("Contraseña").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
