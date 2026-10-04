import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";

import type { AppRole } from "../src/lib/roles";
import { storageStatePath } from "./support/users";

type Fixtures = {
  makeAxeBuilder: () => AxeBuilder;
  /** Abre la sesión guardada por `auth.setup.ts` para el rol indicado. */
  loginAs: (role: AppRole) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    await use(() =>
      new AxeBuilder({ page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
      ]),
    );
  },
  loginAs: async ({ context }, use) => {
    await use(async (role) => {
      const state = JSON.parse(
        await readFile(storageStatePath(role), "utf8"),
      ) as {
        cookies: Parameters<typeof context.addCookies>[0];
      };
      await context.addCookies(state.cookies);
    });
  },
});

export { expect };
