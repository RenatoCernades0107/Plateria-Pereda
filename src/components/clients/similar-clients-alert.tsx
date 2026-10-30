"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reasonsLabel, type SimilarClient } from "@/domain/client-duplicates";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { formatPhone } from "@/domain/phone";

function details(client: SimilarClient): string {
  return [
    client.kind === "empresa" ? "Empresa" : "Persona",
    client.documentType &&
      `${DOCUMENT_LABELS[client.documentType]} ${client.documentNumber}`,
    client.phone && formatPhone(client.phone),
    client.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Aviso antes de registrar un cliente que se parece a otro ya registrado. Con `onUse`
 * (p. ej., al elegir el cliente de una guía) se puede usar el existente; si no, se
 * enlaza a su ficha.
 */
export function SimilarClientsAlert({
  clients,
  pending,
  onUse,
  onCreateAnyway,
}: {
  clients: SimilarClient[];
  pending: boolean;
  onUse?: (client: SimilarClient) => void;
  onCreateAnyway: () => void;
}) {
  const many = clients.length > 1;
  // El documento no se repite: con ese, registrar otro igual no se puede.
  const sameDocument = clients.some((c) => c.reasons.includes("documento"));
  return (
    <div
      role="alert"
      className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
    >
      <div className="space-y-1">
        <p className="font-medium">
          {many
            ? "¿Ya está registrado? Hay clientes parecidos:"
            : "¿Ya está registrado? Hay un cliente parecido:"}
        </p>
        <p>
          Registrar a la misma persona dos veces crea dos fichas en Shopify y
          después falla la sincronización (por ejemplo, «el teléfono ya lo tiene
          otro cliente»).
        </p>
      </div>
      <ul className="space-y-2">
        {clients.map((client) => (
          <li
            key={client.id}
            className="bg-background text-foreground flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
          >
            <span className="min-w-0 space-y-0.5">
              <span className="block font-medium break-words">
                {client.name}
              </span>
              <span className="text-muted-foreground block text-xs break-words">
                {details(client)}
              </span>
              <Badge variant="outline">{reasonsLabel(client.reasons)}</Badge>
            </span>
            {onUse ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => onUse(client)}
              >
                Usar este cliente
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`/clientes/${client.id}`}>Ver ficha</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sameDocument ? (
        <p className="font-medium">
          Ya existe un cliente con ese documento. Usa el que ya está registrado
          o corrige el número.
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onCreateAnyway}
        >
          {pending
            ? "Guardando…"
            : many
              ? "No es ninguno: registrar nuevo"
              : "No es el mismo: registrar nuevo"}
        </Button>
      )}
    </div>
  );
}
