import { History } from "lucide-react";

import {
  PIECE_STATUS_LABELS,
  type PieceEvent,
} from "@/domain/piece-state-machine";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  LogisticsPieceInfo,
  PieceDetail,
  PieceTimelineEvent,
} from "@/server/restorations/queries";

import { Timeline } from "./timeline";

/**
 * Línea de tiempo de una pieza (admin y ventas, Paso 8.5): siempre a la vista, en
 * horizontal, con los colores de cada estado.
 */
export function PieceTimelineStrip({
  piece,
  events,
  now,
  className,
}: {
  piece: PieceDetail;
  events: PieceTimelineEvent[];
  now: Date;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-card space-y-2 rounded-lg border p-3 sm:p-4",
        className,
      )}
      aria-labelledby="linea-tiempo-titulo"
      data-testid="linea-tiempo"
    >
      <h2
        id="linea-tiempo-titulo"
        className="text-heading flex items-center gap-1.5 font-semibold"
      >
        <History aria-hidden className="size-4" />
        Línea de tiempo
      </h2>
      <Timeline
        events={events}
        piece={{
          status: piece.status,
          registeredAt: piece.createdAt,
          deliveredAt: piece.deliveredAt,
        }}
        now={now}
      />
    </section>
  );
}

/** Lo que logística ve de la historia: días en taller y la última observación (P42). */
export function LogisticsPieceSummary({ info }: { info: LogisticsPieceInfo }) {
  const days = `${info.workshopDays} ${info.workshopDays === 1 ? "día" : "días"}`;
  return (
    <div className="space-y-1 text-sm" data-testid="resumen-logistica">
      <p>
        <span className="text-muted-foreground">Días en taller: </span>
        {info.workshopOngoing ? `${days} (en curso)` : days}
      </p>
      {info.lastObservation ? (
        <p className="break-words whitespace-pre-wrap">
          <span className="text-muted-foreground">Última observación: </span>
          {info.lastObservation}
        </p>
      ) : null}
    </div>
  );
}

/** Acciones que no cambian el estado (P47). */
const EVENT_SUMMARY: Record<Exclude<PieceEvent, "estado">, string> = {
  llegada: "Llegó a la tienda",
  vuelta_taller: "Volvió del taller",
  devolucion_cliente: "Devuelta al cliente",
  cambio_precio: "Cambio de precio",
  // Revisión en taller: la pieza va y vuelve sin cambiar de estado.
  envio_revision: "Al taller (revisión)",
  vuelta_revision: "Volvió de revisión",
  retroceso: "Retroceso de estado",
};

/** Resumen por restauración: todos los cambios de estado, del más reciente al más antiguo. */
export function RestorationStatusSummary({
  pieces,
  events,
}: {
  pieces: PieceDetail[];
  events: PieceTimelineEvent[];
}) {
  const code = new Map(pieces.map((p) => [p.id, p.code]));
  const recent = [...events].reverse();
  if (recent.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Sin cambios de estado.</p>
    );
  }
  return (
    <ol className="divide-y rounded-md border" data-testid="resumen-estados">
      {recent.map((e, i) => (
        <li key={i} className="space-y-0.5 p-3 text-sm">
          <p>
            <span className="font-medium">{code.get(e.pieceId)}</span>:{" "}
            {e.event === "retroceso" && e.fromStatus
              ? `${EVENT_SUMMARY[e.event]}: ${PIECE_STATUS_LABELS[e.fromStatus]} → ${PIECE_STATUS_LABELS[e.toStatus]}`
              : e.event !== "estado"
                ? EVENT_SUMMARY[e.event]
                : e.fromStatus
                  ? `${PIECE_STATUS_LABELS[e.fromStatus]} → ${PIECE_STATUS_LABELS[e.toStatus]}`
                  : `Registrada`}
          </p>
          <p className="text-muted-foreground text-xs">
            <time dateTime={e.at}>{formatDateTime(new Date(e.at))}</time> ·{" "}
            {e.actorName ?? "Sistema"}
          </p>
          {e.note ? <p className="whitespace-pre-wrap">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
