"use client";

import { cn } from "@/lib/utils";

import { DRAG_SCROLL_CLASS, useDragScroll } from "./use-drag-scroll";

/**
 * Contenedor que se desplaza de lado arrastrando con el ratón y sin barra, para
 * usarlo desde componentes de servidor. `relative` para que lo absoluto de adentro no
 * ensanche la página.
 */
export function DragScroll({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const dragScroll = useDragScroll<HTMLDivElement>();
  return (
    <div
      {...props}
      ref={dragScroll}
      className={cn("relative overflow-x-auto", DRAG_SCROLL_CLASS, className)}
    >
      {children}
    </div>
  );
}
