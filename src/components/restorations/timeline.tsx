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
import { cn } from "@/lib/utils";

import { DragScroll } from "@/components/drag-scroll";
import { Badge } from "@/components/ui/badge";

import { PieceStatusBadge } from "./status-badges";

/**
 * Línea de tiempo horizontal de una pieza (Pasos 8.5 y 8.6): cada cambio de estado, y las
 * acciones que no lo cambian (llegada, ida y vuelta del taller, devolución), con fecha,
 * usuario y nota, más los días en taller y de cumplimiento. Logística no la ve
 * (P42): para ella la página muestra solo el estado actual, los días en taller y
 * la nota de la última observación.
 */

/** Acciones que no cambian el estado (P47). */
const EVENT_LABELS: Record<Exclude<PieceEvent, "estado">, string> = {
  llegada: "Llegó a la tienda",
  envio_taller: "Enviada al taller",
  vuelta_taller: "Volvió del taller",
  devolucion_cliente: "Devuelta al cliente",
  cambio_precio: "Cambio de precio",
  // Revisión en taller: la pieza va y vuelve sin cambiar de estado.
  envio_revision: "Al taller (revisión)",
  vuelta_revision: "Volvió de revisión",
  retroceso: "Retroceso",
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

  const lastIndex = ordered.length - 1;

  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground text-xs">Días en taller</dt>
          <dd data-testid="dias-taller" className="font-medium">
            {formatDays(workshop)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
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
        // Horizontal, del más antiguo al más reciente; en pantallas angostas se
        // desplaza de lado. Cada paso lleva la insignia del estado (mismos colores).
        <DragScroll
          className="-mx-1 snap-x snap-mandatory px-1 pb-2"
          tabIndex={0}
        >
          <ol className="flex gap-0" aria-label="Línea de tiempo de la pieza">
            {ordered.map((event, i) => {
              const isState = !event.event || event.event === "estado";
              const current = i === lastIndex;
              return (
                <li
                  key={i}
                  data-testid="evento"
                  aria-current={current ? "step" : undefined}
                  className="relative w-48 shrink-0 snap-start pr-3 sm:w-52"
                >
                  {/* Riel: punto del paso y línea hacia el siguiente. */}
                  <div aria-hidden className="mb-2 flex items-center">
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-full border-2",
                        current
                          ? "border-primary bg-primary ring-primary/25 ring-4"
                          : isState
                            ? "border-primary bg-background"
                            : "border-muted-foreground/60 bg-background",
                      )}
                    />
                    {i < lastIndex ? (
                      <span className="bg-border -mr-3 h-0.5 flex-1" />
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "space-y-1 rounded-md border p-2",
                      current ? "border-primary/50 bg-primary/5" : "bg-card",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isState ? (
                        <PieceStatusBadge status={event.toStatus} />
                      ) : (
                        <Badge variant="secondary" data-event={event.event}>
                          {
                            EVENT_LABELS[
                              event.event as keyof typeof EVENT_LABELS
                            ]
                          }
                        </Badge>
                      )}
                      {current ? (
                        <span className="text-primary text-xs font-medium tracking-wide uppercase">
                          Último
                        </span>
                      ) : null}
                    </div>
                    {isState && event.fromStatus ? (
                      <p className="text-muted-foreground text-xs">
                        desde {PIECE_STATUS_LABELS[event.fromStatus]}
                      </p>
                    ) : null}
                    {event.event === "retroceso" && event.fromStatus ? (
                      <p className="text-xs">
                        De {PIECE_STATUS_LABELS[event.fromStatus]} a{" "}
                        {PIECE_STATUS_LABELS[event.toStatus]}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground text-xs">
                      <time dateTime={event.at.toISOString()}>
                        {formatDateTime(event.at)}
                      </time>{" "}
                      · {event.actorName ?? "Sistema"}
                    </p>
                    {event.note ? (
                      <p
                        className="line-clamp-3 text-xs break-words whitespace-pre-wrap"
                        title={event.note}
                      >
                        {event.note}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </DragScroll>
      )}
    </div>
  );
}
