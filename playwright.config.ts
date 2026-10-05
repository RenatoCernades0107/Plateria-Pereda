import { defineConfig, devices } from "@playwright/test";

// E2E_PORT permite correr otra copia del proyecto (otro worktree) a la vez.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const isCI = !!process.env.CI;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  grepInvert: /@shopify-live/,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-PE",
    timezoneId: "America/Lima",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: isCI
      ? `pnpm build && pnpm start -p ${PORT}`
      : `pnpm dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    // Los enlaces de los correos (recuperar contraseña) deben volver a este servidor.
    env: { APP_URL: `http://localhost:${PORT}` },
    timeout: 180_000,
  },
});
