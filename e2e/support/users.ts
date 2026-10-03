import path from "node:path";

import type { AppRole } from "../../src/lib/roles";

export const SEED_PASSWORD = "Pereda-local-2026";

export const SEED_USERS: Record<AppRole, { email: string; fullName: string }> =
  {
    admin: { email: "admin@pereda.test", fullName: "Admin de prueba" },
    ventas: { email: "ventas@pereda.test", fullName: "Ventas de prueba" },
    logistica: {
      email: "logistica@pereda.test",
      fullName: "Logística de prueba",
    },
  };

export function storageStatePath(role: AppRole) {
  return path.join(__dirname, "..", ".auth", `${role}.json`);
}
