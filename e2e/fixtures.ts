import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";

export type AppRole = "admin" | "ventas" | "logistica";

type Fixtures = {
  makeAxeBuilder: () => AxeBuilder;
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
  loginAs: async ({}, use) => {
    await use(async (role) => {
      throw new Error(`loginAs("${role}") se implementa en el Paso 2.2`);
    });
  },
});

export { expect };
