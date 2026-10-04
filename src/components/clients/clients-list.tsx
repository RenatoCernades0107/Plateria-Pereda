import { Building2, User } from "lucide-react";
import Link from "next/link";

import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { formatPhone } from "@/domain/phone";
import type { ClientListItem } from "@/server/clients/queries";

function Kind({ kind }: { kind: ClientListItem["kind"] }) {
  const Icon = kind === "empresa" ? Building2 : User;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <Icon className="size-3.5" aria-hidden />
      {kind === "empresa" ? "Empresa" : "Persona"}
    </span>
  );
}

function Document({ client }: { client: ClientListItem }) {
  return client.documentType ? (
    <span>
      {DOCUMENT_LABELS[client.documentType]} {client.documentNumber}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function Sync({
  client,
  canRetry,
}: {
  client: ClientListItem;
  canRetry: boolean;
}) {
  return client.sync ? (
    <SyncStatus
      jobId={client.sync.jobId}
      status={client.sync.status}
      lastError={client.sync.lastError}
      canRetry={canRetry}
    />
  ) : (
    <span className="text-muted-foreground text-xs">—</span>
  );
}

/** Nombre con enlace al detalle del cliente. */
function Name({ client }: { client: ClientListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link
        href={`/clientes/${client.id}`}
        className="text-heading font-medium underline-offset-4 hover:underline"
      >
        {client.displayName}
      </Link>
      {client.active ? null : <Badge variant="outline">Inactivo</Badge>}
    </span>
  );
}

export function ClientsList({
  clients,
  canRetry,
  emptyMessage = "Aún no hay clientes registrados.",
}: {
  clients: ClientListItem[];
  canRetry: boolean;
  emptyMessage?: string;
}) {
  if (clients.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Shopify</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow key={c.id} data-testid={`cliente-${c.displayName}`}>
              <TableCell>
                <div className="flex flex-col">
                  <Name client={c} />
                  <Kind kind={c.kind} />
                </div>
              </TableCell>
              <TableCell>
                <Document client={c} />
              </TableCell>
              <TableCell>{c.phone ? formatPhone(c.phone) : "—"}</TableCell>
              <TableCell className="max-w-56 truncate">
                {c.email ?? "—"}
              </TableCell>
              <TableCell>
                <Sync client={c} canRetry={canRetry} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Clientes">
        {clients.map((c) => (
          <li
            key={c.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`cliente-movil-${c.displayName}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Name client={c} />
                <Kind kind={c.kind} />
              </div>
            </div>
            <div className="text-muted-foreground space-y-0.5 text-sm">
              <p>
                <Document client={c} />
              </p>
              {c.phone ? <p>{formatPhone(c.phone)}</p> : null}
              {c.email ? <p className="truncate">{c.email}</p> : null}
            </div>
            <Sync client={c} canRetry={canRetry} />
          </li>
        ))}
      </ul>
    </>
  );
}
