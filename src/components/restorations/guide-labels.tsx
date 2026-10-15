import { ClipboardList, Gem } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ayudas visuales para distinguir la guía (la restauración RES-xxxxx) de sus piezas
 * (RES-xxxxx-1, -2…). Usan los mismos íconos que el menú: la guía con el de
 * Restauraciones y la pieza con el de Piezas. La guía va sobre un fondo cálido tenue
 * (`bg-guide`) con un acento arriba; cada pieza, en blanco con un acento a la
 * izquierda, como hoja de la guía.
 */

/** Superficie de la guía: fondo cálido tenue y acento de marca arriba. */
export const GUIDE_CARD_CLASS =
  "bg-guide rounded-lg border border-t-4 border-t-primary/70 p-4 shadow-xs sm:p-5";

/** Superficie de la guía sin acento (p. ej., el formulario que la registra). */
export const GUIDE_SURFACE_CLASS = "bg-guide rounded-lg border p-4 sm:p-5";

/** Acento de una pieza (lista y kanban del detalle). */
export const PIECE_ACCENT_CLASS = "border-l-4 border-l-primary/60";

const EYEBROW_CLASS =
  "text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase [&>svg]:size-3.5 [&>svg]:shrink-0";

/** Rótulo "Guía" sobre el código de la restauración. */
export function GuideEyebrow({ className }: { className?: string }) {
  return (
    <p className={cn(EYEBROW_CLASS, className)} data-testid="rotulo-guia">
      <ClipboardList aria-hidden />
      Guía
    </p>
  );
}

/** Rótulo "Pieza N · código" de cada pieza de la guía. */
export function PieceEyebrow({
  number,
  code,
  className,
}: {
  number: number;
  code: string;
  className?: string;
}) {
  return (
    <p className={cn(EYEBROW_CLASS, className)} data-testid="rotulo-pieza">
      <Gem aria-hidden />
      <span>Pieza {number}</span> <span aria-hidden>·</span> <span>{code}</span>
    </p>
  );
}

/** Título de la lista de piezas de la guía, con su número. */
export function PiecesHeading({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-heading flex items-center gap-2 font-semibold",
        className,
      )}
    >
      <Gem aria-hidden className="text-primary size-4" />
      Piezas de la guía{" "}
      <span className="text-muted-foreground font-normal">({count})</span>
    </h2>
  );
}
