"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Error fuera del menú (p. ej., en el login): ocupa toda la pantalla. */
export default function RootError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorScreen {...props} fullScreen title="Algo salió mal" />;
}
