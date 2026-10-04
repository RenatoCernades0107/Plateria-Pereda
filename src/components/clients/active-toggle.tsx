"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setClientActive, setContactActive } from "@/server/clients/actions";

/** Desactiva o reactiva un cliente o contacto (no se borran: tienen historial). */
export function ActiveToggle({
  entity,
  id,
  name,
  active,
}: {
  entity: "client" | "contact";
  id: string;
  name: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const action = entity === "client" ? setClientActive : setContactActive;
      const result = await action(id, !active);
      if ("error" in result) toast.error(result.error);
      else toast.success(`${name} fue ${active ? "desactivado" : "activado"}.`);
    });

  return (
    <Button
      variant={active ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={toggle}
      aria-label={`${active ? "Desactivar" : "Activar"} ${name}`}
    >
      {active ? "Desactivar" : "Activar"}
    </Button>
  );
}
