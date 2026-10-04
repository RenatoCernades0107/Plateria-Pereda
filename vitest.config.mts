import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/*.int.test.ts", "node_modules/**"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.int.test.ts"],
          exclude: ["node_modules/**"],
          globalSetup: ["tests/setup/integration.global.ts"],
          setupFiles: ["tests/setup/integration.ts"],
          testTimeout: 20_000,
          // Comparten la BD local: el test del outbox toma y borra los jobs pendientes
          // de todos, así que un archivo a la vez.
          fileParallelism: false,
        },
      },
    ],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.int.test.ts",
        "src/app/**/{layout,page}.tsx",
        "src/components/ui/**",
        "src/lib/supabase/database.types.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        "src/domain/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
