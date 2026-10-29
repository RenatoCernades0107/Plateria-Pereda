"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Error inesperado al cargar una sección: se ve dentro del menú, con reintento. */
export default function AppError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorScreen {...props} title="No se pudo cargar esta sección" />;
}
