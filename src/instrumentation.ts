import { parseServerEnv } from "@/lib/env";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Si falta o es inválida alguna variable, el servidor no arranca.
  parseServerEnv(process.env);
}
