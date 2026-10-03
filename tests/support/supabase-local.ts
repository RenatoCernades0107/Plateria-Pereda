import { execSync } from "node:child_process";

type SupabaseStatus = {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
};

/** URL y claves del Supabase local en ejecución: los tests nunca apuntan a otra base de datos. */
export function readLocalSupabaseEnv(): Record<string, string> {
  let raw: string;
  try {
    raw = execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Supabase local no está corriendo. Ejecuta `pnpm db:start` antes de los tests de integración.",
    );
  }
  const status = JSON.parse(raw) as SupabaseStatus;
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    APP_URL: "http://localhost:3000",
    SHOPIFY_MODE: "fake",
  };
}
