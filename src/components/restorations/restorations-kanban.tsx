import Link from "next/link";

import { KanbanCard, KanbanColumns } from "@/components/kanban-columns";
import { Badge } from "@/components/ui/badge";
import { WhatsAppBadge } from "@/components/whatsapp-badge";
import { formatCents } from "@/domain/money";
import {
  formatPartialProgress,
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
  type PartialProgress,
  type RestorationStatus,
} from "@/domain/restoration-status";
import { formatDate } from "@/lib/format";
import type { RestorationListItem } from "@/server/restorations/queries";

import { PaymentStatusBadge } from "./status-badges";

/**
 * Tablero kanban de restauraciones: una columna por estado general. Logística no
 * ve las columnas de restauraciones pasadas (completadas y anuladas, D24) ni montos;
 * las rechazadas sí, mientras tengan piezas por devolver (P48).
 */
export function RestorationsKanban({
  items,
  showMoney,
  showClient = true,
  progress,
}: {
  items: RestorationListItem[];
  showMoney: boolean;
  /** Logística no ve clientes. */
  showClient?: boolean;
  /** Avance de las restauraciones en estado parcial ("2/6 aprobadas"). */
  progress?: ReadonlyMap<string, PartialProgress>;
}) {
  const statuses: readonly RestorationStatus[] = showMoney
    ? RESTORATION_STATUSES
    : RESTORATION_STATUSES.filter((s) => s !== "completada" && s !== "anulada");

  return (
    <KanbanColumns
      label="Restauraciones por estado"
      emptyText="Sin restauraciones"
      columns={statuses.map((status) => ({
        key: status,
        label: RESTORATION_STATUS_LABELS[status],
        items: items.filter((r) => r.status === status),
      }))}
      renderCard={(r) => (
        <KanbanCard key={r.id} data-testid={`tarjeta-${r.code}`}>
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
          {showClient ? <p className="truncate">{r.clientName}</p> : null}
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>
              {r.piecesCount} {r.piecesCount === 1 ? "pieza" : "piezas"}
            </span>
            {progress?.get(r.id) ? (
              <Badge
                variant="secondary"
                className="tabular-nums"
                data-testid={`avance-${r.code}`}
              >
                {formatPartialProgress(progress.get(r.id)!)}
              </Badge>
            ) : null}
            {showMoney && r.totalCents !== null ? (
              <span>{formatCents(r.totalCents)}</span>
            ) : null}
            {r.origin === "whatsapp" ? (
              <WhatsAppBadge>WhatsApp</WhatsAppBadge>
            ) : null}
            {r.paymentStatus ? (
              <PaymentStatusBadge status={r.paymentStatus} />
            ) : null}
          </div>
        </KanbanCard>
      )}
    />
  );
}
