"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ClientOption } from "@/domain/client-search";

import { ClientPicker } from "./client-picker";

/** Buscador de la página de clientes (al elegir, el detalle llega en el Paso 6.5). */
export function ClientsSearch({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ClientOption | null>(null);
  return (
    <div className="max-w-xl space-y-1.5">
      <label htmlFor="buscar-cliente" className="text-sm font-medium">
        Buscar cliente
      </label>
      <ClientPicker
        id="buscar-cliente"
        value={selected}
        canCreate={canCreate}
        onSelect={(option) => {
          setSelected(option);
          router.refresh();
        }}
      />
    </div>
  );
}
