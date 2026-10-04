import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-brand text-sm font-semibold tracking-widest">403</p>
      <h1 className="text-heading text-2xl font-semibold">
        No tienes acceso a esta sección
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Tu rol no tiene permiso para ver esta página. Si crees que es un error,
        habla con el administrador.
      </p>
      <Button asChild>
        <Link href="/">Ir al inicio</Link>
      </Button>
    </main>
  );
}
