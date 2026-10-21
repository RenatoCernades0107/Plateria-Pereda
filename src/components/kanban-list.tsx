"use client";

import { cn } from "@/lib/utils";

import { DRAG_SCROLL_CLASS, useDragScroll } from "./use-drag-scroll";

/**
 * Lista de columnas: en el celular se desplaza en horizontal sin mover la página; con
 * el ratón, arrastrando el fondo (no las tarjetas). Sin barra de desplazamiento.
 * `relative`: los textos absolutos de las tarjetas (`sr-only`) quedan dentro del
 * contenedor y no ensanchan la página en el celular.
 */
export function KanbanList({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const dragScroll = useDragScroll<HTMLDivElement>();
  return (
    <div
      ref={dragScroll}
      className={cn(
        "relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0",
        DRAG_SCROLL_CLASS,
      )}
    >
      <div className="flex gap-3" role="list" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
