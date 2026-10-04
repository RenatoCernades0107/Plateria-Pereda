import { SYSTEM_ACTOR, type AuditEntry } from "@/domain/audit";
import { formatDateTime } from "@/lib/format";

import { ActionBadge } from "./action-badge";
import { ChangeList } from "./change-list";

/** Pestaña "Historial" de una restauración, pieza, cliente o taller. */
export function EntityHistory({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aún no hay cambios registrados.
      </p>
    );
  }

  return (
    <ol className="space-y-4" aria-label="Historial de cambios">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 pl-4">
          <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <time dateTime={entry.occurredAt}>
              {formatDateTime(entry.occurredAt)}
            </time>
            <span aria-hidden>·</span>
            <span className="text-heading font-medium">
              {entry.actorName ?? SYSTEM_ACTOR}
            </span>
            <ActionBadge action={entry.action} />
          </div>
          <ChangeList entry={entry} />
        </li>
      ))}
    </ol>
  );
}
