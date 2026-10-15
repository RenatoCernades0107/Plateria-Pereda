import Link from "next/link";

import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <StatusPage
      fullScreen
      code="403"
      title="No tienes acceso a esta sección"
      action={
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      }
    >
      Tu rol no tiene permiso para ver esta página. Si crees que es un error,
      habla con el administrador.
    </StatusPage>
  );
}
