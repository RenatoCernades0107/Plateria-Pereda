import type { Instrumentation } from "next";

import { parseServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Si falta o es inválida alguna variable, el servidor no arranca.
  parseServerEnv(process.env);
}

/**
 * Monitoreo de errores (Paso 15.4): todo error que Next captura en el servidor (páginas,
 * route handlers, server actions y proxy) queda como una línea `error` en los logs de
 * Vercel, con el `digest` que la página de error le muestra al usuario. Sin cabeceras
 * ni query string (pueden traer cookies o datos del cliente). Si se adopta una
 * herramienta de monitoreo (P06), se le envía el error desde aquí.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  logger.error("Error no controlado en el servidor", {
    error,
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
  });
};
