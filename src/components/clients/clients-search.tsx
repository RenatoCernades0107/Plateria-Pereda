"use client";

import { useRouter } from "next/navigation";

import type { ClientOption } from "@/domain/client-search";

import { ClientPicker } from "./client-picker";

/** Buscador de la página de clientes: al elegir uno abre su detalle. */
export function ClientsSearch({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  return (
    <div className="max-w-xl space-y-1.5">
      <label htmlFor="buscar-cliente" className="text-sm font-medium">
        Buscar cliente
      </label>
      <ClientPicker
        id="buscar-cliente"
        canCreate={canCreate}
        onSelect={(option: ClientOption) => {
          // Del buscador siempre llega un cliente del sistema (los de Shopify se
          // guardan antes); un contacto abre su empresa.
          if (option.source === "local") {
            router.push(`/clientes/${option.clientId}`);
          }
        }}
      />
    </div>
  );
}
