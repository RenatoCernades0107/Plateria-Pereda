import Link from "next/link";

import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

/** Registro inexistente (`notFound()` en un detalle): se ve dentro del menú. */
export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="No encontramos lo que buscas"
      action={
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      }
    >
      Puede que el registro se haya eliminado o que el enlace esté incompleto.
    </StatusPage>
  );
}
