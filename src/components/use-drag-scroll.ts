"use client";

import { useCallback } from "react";

/**
 * Desplazar de lado arrastrando con el ratón (kanban y tablas anchas): así no hay que
 * bajar hasta la barra de desplazamiento. En pantallas táctiles ya se desplaza solo.
 *
 * No empieza sobre controles ni sobre las tarjetas del kanban (`data-no-drag-scroll`),
 * que se arrastran con dnd-kit. Recién se activa tras unos píxeles, así los clics
 * siguen funcionando; tras un arrastre real se anula el clic que viene después (para
 * que una fila clicable no navegue).
 */

const SKIP = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role=checkbox]",
  "[role=button]",
  "[role=combobox]",
  "[role=menuitem]",
  "[contenteditable]:not([contenteditable=false])",
  "[data-no-drag-scroll]",
].join(",");

/** Píxeles antes de considerarlo arrastre y no clic. */
const THRESHOLD = 5;

/** Clases del contenedor: mano mientras se puede desplazar y al arrastrar. */
export const DRAG_SCROLL_CLASS =
  "data-drag-scroll:cursor-grab data-drag-scrolling:cursor-grabbing data-drag-scrolling:select-none data-drag-scrolling:**:cursor-grabbing";

const overflows = (el: HTMLElement) => el.scrollWidth > el.clientWidth;

/** Ref (callback) para el contenedor con `overflow-x`. */
export function useDragScroll<T extends HTMLElement>() {
  return useCallback((el: T | null) => (el ? attach(el) : undefined), []);
}

/** Escucha el puntero sobre el contenedor; devuelve la limpieza. */
function attach(el: HTMLElement) {
  // `data-drag-scroll` solo si hay desplazamiento horizontal (cursor de mano).
  const update = () => el.toggleAttribute("data-drag-scroll", overflows(el));
  update();
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  observer?.observe(el);
  if (el.firstElementChild) observer?.observe(el.firstElementChild);

  let drag: { startX: number; startLeft: number; active: boolean } | null =
    null;

  const suppressClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onMove = (event: PointerEvent) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) < THRESHOLD) return;
      drag.active = true;
      el.setAttribute("data-drag-scrolling", "");
      window.getSelection()?.removeAllRanges();
    }
    event.preventDefault();
    el.scrollLeft = drag.startLeft - dx;
  };

  function onUp() {
    stop();
    if (!drag?.active) {
      drag = null;
      return;
    }
    drag = null;
    el.removeAttribute("data-drag-scrolling");
    // El clic que sigue al soltar no debe abrir la fila o el enlace.
    el.addEventListener("click", suppressClick, {
      capture: true,
      once: true,
    });
    setTimeout(() => el.removeEventListener("click", suppressClick, true), 0);
  }

  // Mientras se arrastra no se selecciona texto.
  const onSelectStart = (event: Event) => {
    if (drag?.active) event.preventDefault();
  };

  function stop() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }

  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target || target.closest(SKIP)) return;
    // Clic sobre la propia barra de desplazamiento: la maneja el navegador.
    if (target === el && event.offsetY > el.clientHeight) return;
    if (!overflows(el)) return;
    drag = { startX: event.clientX, startLeft: el.scrollLeft, active: false };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("selectstart", onSelectStart);
  return () => {
    stop();
    observer?.disconnect();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("selectstart", onSelectStart);
    el.removeEventListener("click", suppressClick, true);
    el.removeAttribute("data-drag-scroll");
    el.removeAttribute("data-drag-scrolling");
  };
}
