import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { parseServerEnv } from "./src/lib/env";

const nextConfig: NextConfig = {};

export default function config(phase: string): NextConfig {
  // En Vercel, un despliegue mal configurado falla al compilar y no reemplaza al que está en línea.
  if (phase === PHASE_PRODUCTION_BUILD && process.env.VERCEL === "1") {
    parseServerEnv(process.env);
  }
  return nextConfig;
}
