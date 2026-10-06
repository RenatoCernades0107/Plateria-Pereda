import {
  daysInWorkshop,
  fulfillmentDays,
  type DayCount,
} from "@/domain/piece-days";
import {
  PIECE_STATUS_LABELS,
  type PieceEvent,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import { formatDateTime } from "@/lib/format";

import { Badge } from "@/components/ui/badge";

import { PieceStatusBadge } from "./status-badges";

/**
 * Línea de tiempo de una pieza (Pasos 8.5 y 8.6): cada cambio de estado, y las
 * acciones que no lo cambian (llegada, vuelta del taller, devolución), con fecha,
 * usuario y nota, más los días en taller y de cumplimiento. Logística no la ve
 * (P42): para ella la página muestra solo el estado actual, los días en taller y
 * la nota de la última observación.
 */

/** Acciones que no cambian el estado (P47). */
const EVENT_LABELS: Record<Exclude<PieceEvent, "estado">, string> = {
  llegada: "Llegó a la tienda",
  vuelta_taller: "Volvió del taller",
  devolucion_cliente: "Devuelta al cliente",
};

/** Un paso de `piece_status_history`. */
export type TimelineEvent = {
  /** Por defecto "estado" (un cambio de estado). */
  event?: PieceEvent;
  at: Date | string;
  /** Null en el registro inicial de la pieza. */
  fromStatus: PieceStatus | null;
  toStatus: PieceStatus;
  /** Null si lo hizo el sistema (p. ej., un webhook). */
  actorName: string | null;
  note: string | null;
};

export type TimelinePiece = {
  status: PieceStatus;
  registeredAt: Date | string;
  deliveredAt: Date | string | null;
};

function formatDays(count: DayCount | null): string {
  if (!count) return "—";
  const days = `${count.days} ${count.days === 1 ? "día" : "días"}`;
  return count.ongoing ? `${days} (en curso)` : days;
}

export function Timeline({
  events,
  piece,
  now,
}: {
  events: readonly TimelineEvent[];
  piece: TimelinePiece;
  /** Hasta cuándo se cuentan los días "en curso"; se pasa desde el servidor. */
  now: Date;
}) {
  const ordered = events
    .map((e) => ({ ...e, at: new Date(e.at) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const workshop = daysInWorkshop(
    ordered.map((e) => ({
      event: e.event,
      from: e.fromStatus,
      to: e.toStatus,
      at: e.at,
    })),
    now,
  );
  const fulfillment = fulfillmentDays(
    {
      status: piece.status,
      registeredAt: new Date(piece.registeredAt),
      deliveredAt: piece.deliveredAt ? new Date(piece.deliveredAt) : null,
    },
    now,
  );

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Días en taller</dt>
          <dd data-testid="dias-taller" className="font-medium">
            {formatDays(workshop)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            Días de cumplimiento
          </dt>
          <dd data-testid="dias-cumplimiento" className="font-medium">
            {formatDays(fulfillment)}
          </dd>
        </div>
      </dl>

      {ordered.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin cambios de estado.</p>
      ) : (
        <ol className="border-border space-y-4 border-l pl-4">
          {ordered.map((event, i) => (
            <li key={i} data-testid="evento" className="relative space-y-1">
              <span
                aria-hidden
                className="bg-primary absolute top-1.5 -left-[21px] size-2.5 rounded-full"
              />
              <div className="flex flex-wrap items-center gap-2">
                {event.event && event.event !== "estado" ? (
                  <Badge variant="secondary" data-event={event.event}>
                    {EVENT_LABELS[event.event]}
                  </Badge>
                ) : (
                  <>
                    <PieceStatusBadge status={event.toStatus} />
                    {event.fromStatus && (
                      <span className="text-muted-foreground text-xs">
                        desde {PIECE_STATUS_LABELS[event.fromStatus]}
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                <time dateTime={event.at.toISOString()}>
                  {formatDateTime(event.at)}
                </time>{" "}
                · {event.actorName ?? "Sistema"}
              </p>
              {event.note && (
                <p className="text-sm break-words whitespace-pre-wrap">
                  {event.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
