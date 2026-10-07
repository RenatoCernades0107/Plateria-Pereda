import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatCents, PAYMENT_STATUS_LABELS } from "@/domain/money";
import {
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
  type RestorationStatus,
} from "@/domain/restoration-status";
import { formatDate } from "@/lib/format";
import type { RestorationListItem } from "@/server/restorations/queries";

/**
 * Tablero kanban de restauraciones: una columna por estado general. Logística no
 * ve las columnas de restauraciones pasadas (completadas y anuladas, D24) ni montos;
 * las rechazadas sí, mientras tengan piezas por devolver (P48).
 */
export function RestorationsKanban({
  items,
  showMoney,
}: {
  items: RestorationListItem[];
  showMoney: boolean;
}) {
  const statuses: readonly RestorationStatus[] = showMoney
    ? RESTORATION_STATUSES
    : RESTORATION_STATUSES.filter((s) => s !== "completada" && s !== "anulada");

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div
        className="flex gap-3"
        role="list"
        aria-label="Restauraciones por estado"
      >
        {statuses.map((status) => {
          const column = items.filter((r) => r.status === status);
          return (
            <section
              key={status}
              role="listitem"
              aria-label={RESTORATION_STATUS_LABELS[status]}
              className="bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-2"
              data-testid={`columna-${status}`}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                {RESTORATION_STATUS_LABELS[status]}
                <span className="text-muted-foreground font-normal">
                  {column.length}
                </span>
              </h2>
              {column.length === 0 ? (
                <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                  Sin restauraciones
                </p>
              ) : (
                column.map((r) => (
                  <article
                    key={r.id}
                    className="bg-background space-y-1.5 rounded-md border p-3 text-sm shadow-xs"
                    data-testid={`tarjeta-${r.code}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/restauraciones/${r.id}`}
                        className="text-heading font-medium underline-offset-4 hover:underline"
                      >
                        {r.code}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {formatDate(r.createdAt)}
                      </span>
                    </div>
                    <p className="truncate">{r.clientName}</p>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        {r.piecesCount}{" "}
                        {r.piecesCount === 1 ? "pieza" : "piezas"}
                      </span>
                      {showMoney && r.totalCents !== null ? (
                        <span>{formatCents(r.totalCents)}</span>
                      ) : null}
                      {r.origin === "whatsapp" ? (
                        <Badge variant="secondary">WhatsApp</Badge>
                      ) : null}
                      {r.paymentStatus ? (
                        <Badge variant="outline">
                          {PAYMENT_STATUS_LABELS[r.paymentStatus]}
                        </Badge>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
