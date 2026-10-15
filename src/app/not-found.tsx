import Link from "next/link";

import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

/** Direcciones que no existen (fuera del menú: no se sabe si hay sesión). */
export default function NotFound() {
  return (
    <StatusPage
      fullScreen
      code="404"
      title="Esta página no existe"
      action={
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      }
    >
      Revisa la dirección o vuelve al inicio.
    </StatusPage>
  );
}
