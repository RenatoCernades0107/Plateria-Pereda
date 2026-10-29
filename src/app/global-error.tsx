"use client";

import { ErrorScreen } from "@/components/error-screen";

import "./globals.css";

/**
 * Error en el layout raíz: reemplaza todo el documento, así que trae su propio
 * <html>, <body> y estilos.
 */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es-PE" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <title>Error · Platería Pereda</title>
        <ErrorScreen {...props} fullScreen title="Algo salió mal" />
      </body>
    </html>
  );
}
