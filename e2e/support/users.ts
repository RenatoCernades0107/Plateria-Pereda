import path from "node:path";

import type { AppRole } from "../../src/lib/roles";

export const SEED_PASSWORD = "Pereda-local-2026";

export const SEED_USERS: Record<
  AppRole,
  { email: string; fullName: string; home: string }
> = {
  admin: {
    email: "admin@pereda.test",
    fullName: "Admin de prueba",
    home: "/dashboard",
  },
  ventas: {
    email: "ventas@pereda.test",
    fullName: "Ventas de prueba",
    home: "/dashboard",
  },
  logistica: {
    email: "logistica@pereda.test",
    fullName: "Logística de prueba",
    home: "/piezas",
  },
};

export function storageStatePath(role: AppRole) {
  return path.join(__dirname, "..", ".auth", `${role}.json`);
}
