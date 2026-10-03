import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { entityLabel, SYSTEM_ACTOR, type AuditEntry } from "@/domain/audit";
import { formatDateTime } from "@/lib/format";

import { ActionBadge } from "./action-badge";
import { ChangeList } from "./change-list";

export function recordKey(table: string, recordId: string) {
  return `${table}:${recordId}`;
}

function RecordName({
  entry,
  labels,
}: {
  entry: AuditEntry;
  labels: Record<string, string>;
}) {
  const name = labels[recordKey(entry.table, entry.recordId)];
  return (
    <span className="flex flex-col">
      <span className="text-heading font-medium">
        {entityLabel(entry.table)}
      </span>
      <span className="text-muted-foreground text-xs break-all">
        {name ?? entry.recordId}
      </span>
    </span>
  );
}

/** Registros de /auditoria: tabla en escritorio y tarjetas en el celular. */
export function AuditLogList({
  entries,
  recordLabels,
}: {
  entries: AuditEntry[];
  recordLabels: Record<string, string>;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        No hay cambios con estos filtros.
      </p>
    );
  }

  return (
    <>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Registro</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Cambios</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id} data-testid="auditoria-registro">
              <TableCell className="align-top whitespace-nowrap">
                <time dateTime={entry.occurredAt}>
                  {formatDateTime(entry.occurredAt)}
                </time>
              </TableCell>
              <TableCell className="align-top">
                {entry.actorName ?? SYSTEM_ACTOR}
              </TableCell>
              <TableCell className="align-top">
                <RecordName entry={entry} labels={recordLabels} />
              </TableCell>
              <TableCell className="align-top">
                <ActionBadge action={entry.action} />
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <ChangeList entry={entry} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="space-y-2 rounded-md border p-3"
            data-testid="auditoria-registro-movil"
          >
            <div className="flex items-start justify-between gap-2">
              <RecordName entry={entry} labels={recordLabels} />
              <ActionBadge action={entry.action} />
            </div>
            <p className="text-muted-foreground text-xs">
              <time dateTime={entry.occurredAt}>
                {formatDateTime(entry.occurredAt)}
              </time>{" "}
              · {entry.actorName ?? SYSTEM_ACTOR}
            </p>
            <ChangeList entry={entry} />
          </li>
        ))}
      </ul>
    </>
  );
}
