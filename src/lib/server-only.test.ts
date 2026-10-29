import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Paso 15.1: la clave secreta de Supabase y los secretos de Shopify nunca llegan al
 * navegador. Se leen solo en módulos marcados con `server-only` (importarlos desde un
 * componente de cliente rompe el build) y ningún componente de cliente los importa.
 */
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(process.cwd(), path),
  code: readFileSync(path, "utf8"),
}));

const SECRET_MODULES = [
  "src/lib/env.server.ts",
  "src/lib/supabase/admin.ts",
  "src/server/secrets.ts",
  "src/server/shopify/token-store.ts",
];

describe("secretos solo en el servidor", () => {
  it.each(SECRET_MODULES)("%s importa server-only", (path) => {
    const file = files.find((f) => f.path === path);
    expect(file?.code).toMatch(/^import "server-only";/m);
  });

  it("process.env solo se lee en env.ts (validado) e instrumentation.ts", () => {
    const readers = files
      .filter((f) => /process\.env\b/.test(f.code))
      .map((f) => f.path);
    expect(readers.sort()).toEqual([
      "src/instrumentation.ts",
      "src/lib/env.server.ts",
      "src/lib/env.ts",
    ]);
  });

  it("los componentes de cliente solo importan server actions del servidor", () => {
    const isServerAction = (module: string) => {
      const base = join(SRC, module);
      const file = files.find((f) =>
        [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]
          .map((p) => relative(process.cwd(), p))
          .includes(f.path),
      );
      return file !== undefined && /^["']use server["'];/.test(file.code);
    };
    const offenders = files.flatMap((f) => {
      if (!/^["']use client["'];/m.test(f.code)) return [];
      const code = f.code.replace(/import type [^;]+;/g, "");
      return [...code.matchAll(/from "@\/((?:server|lib)\/[^"]+)"/g)]
        .map((m) => m[1]!)
        .filter(
          (module) =>
            /^(server\/|lib\/env\.server|lib\/supabase\/(admin|server))/.test(
              module,
            ) && !isServerAction(module),
        )
        .map((module) => `${f.path} → ${module}`);
    });
    expect(offenders).toEqual([]);
  });

  it("fuera de server-only, solo env.ts (que valida) nombra las variables secretas", () => {
    const secrets =
      /SUPABASE_SECRET_KEY|SHOPIFY_CLIENT_SECRET|SHOPIFY_ACCESS_TOKEN|CRON_SECRET/;
    const outside = files.filter(
      (f) =>
        secrets.test(f.code.replace(/\/\/.*$/gm, "")) &&
        !/^import "server-only";/m.test(f.code) &&
        !f.path.startsWith("src/app/api/") &&
        // env.ts valida las variables; config.ts las recibe ya leídas (y los E2E
        // importan su secreto de prueba, por eso no lleva server-only).
        !["src/lib/env.ts", "src/server/shopify-webhooks/config.ts"].includes(
          f.path,
        ),
    );
    expect(outside.map((f) => f.path)).toEqual([]);
  });
});
