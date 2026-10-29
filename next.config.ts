import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

import { parseServerEnv } from "./src/lib/env";
import { securityHeaders } from "./src/lib/security-headers";

export default function config(phase: string): NextConfig {
  // En Vercel, un despliegue mal configurado falla al compilar y no reemplaza al que está en línea.
  if (phase === PHASE_PRODUCTION_BUILD && process.env.VERCEL === "1") {
    parseServerEnv(process.env);
  }
  return {
    // Habilita forbidden() para responder 403 a quien no tiene permiso.
    experimental: { authInterrupts: true },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: securityHeaders({
            // Sin variables (el job de build del CI) se asume Supabase local.
            supabaseUrl:
              process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
            isDev: phase === PHASE_DEVELOPMENT_SERVER,
          }),
        },
      ];
    },
  };
}
