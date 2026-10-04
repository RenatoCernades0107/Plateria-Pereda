// Crea o actualiza .env.local con la URL y las claves del Supabase local (`supabase status`).
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

let status;
try {
  status = JSON.parse(
    execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
} catch {
  console.error(
    "Supabase local no está corriendo. Ejecuta `pnpm db:start` primero.",
  );
  process.exit(1);
}

const values = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
};

const target = ".env.local";
let content = readFileSync(
  existsSync(target) ? target : ".env.example",
  "utf8",
);
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content)
    ? content.replace(pattern, () => line)
    : `${content.trimEnd()}\n${line}\n`;
}
// Secreto local para `pnpm shopify:sync` y el endpoint de cron; se conserva si ya existe.
if (!/^CRON_SECRET=.+$/m.test(content)) {
  const line = `CRON_SECRET=${randomBytes(24).toString("hex")}`;
  content = /^CRON_SECRET=.*$/m.test(content)
    ? content.replace(/^CRON_SECRET=.*$/m, line)
    : `${content.trimEnd()}\n${line}\n`;
}
writeFileSync(target, content);
console.log(`${target} actualizado con los datos de Supabase local.`);
