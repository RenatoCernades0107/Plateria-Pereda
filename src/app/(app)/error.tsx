"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

/** Error inesperado al cargar una sección: se ve dentro del menú, con reintento. */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      code="Error"
      title="No se pudo cargar esta sección"
      action={
        <>
          <Button onClick={() => retry()}>
            <RotateCw />
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Ir al inicio</Link>
          </Button>
        </>
      }
    >
      Puede ser un problema de conexión. Inténtalo de nuevo; si sigue pasando,
      avisa al administrador
      {error.digest ? ` con este código: ${error.digest}` : ""}.
    </StatusPage>
  );
}
