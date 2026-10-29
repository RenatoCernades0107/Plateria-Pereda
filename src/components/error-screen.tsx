"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

/**
 * Error inesperado con reintento. El detalle queda en los logs del servidor
 * (`onRequestError`); al usuario solo se le muestra el código (`digest`) para que lo
 * pase al administrador.
 */
export function ErrorScreen({
  error,
  retry,
  title,
  fullScreen = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  fullScreen?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      fullScreen={fullScreen}
      code="Error"
      title={title}
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
