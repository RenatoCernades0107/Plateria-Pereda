"use client";

import type { ComponentProps, MouseEvent } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Toda la fila lleva al detalle (S3 de MejorasUI.md, patrón de la index table de
 * Polaris): el clic en cualquier parte de la fila hace clic en su enlace principal
 * (`data-primary-link`), que sigue siendo un `<a>` real para abrir en otra pestaña y
 * para el teclado. Se ignoran los clics en controles (checkboxes, botones, celdas
 * editables, otros enlaces), en lo que esté marcado con `data-row-click="ignore"`, y
 * cuando se está seleccionando texto.
 */

const INTERACTIVE = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role=button]",
  "[role=checkbox]",
  "[role=combobox]",
  "[role=menuitem]",
  "[role=option]",
  "[contenteditable=true]",
  "[data-row-click=ignore]",
].join(",");

export function navigateRow(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.button !== 0) return;
  const row = event.currentTarget;
  const target = event.target as Element | null;
  // Los menús y diálogos en portal burbujean por React pero no están en la fila.
  if (!target || !row.contains(target)) return;
  const control = target.closest(INTERACTIVE);
  if (control && row.contains(control)) return;
  if (window.getSelection()?.toString()) return;
  const link = row.querySelector<HTMLAnchorElement>("a[data-primary-link]");
  if (!link) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    window.open(link.href, "_blank", "noopener");
    return;
  }
  link.click();
}

/** `TableRow` que navega al detalle con un clic en cualquier parte. */
export function ClickableRow({
  className,
  ...props
}: ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      {...props}
      data-row-link=""
      className={cn("cursor-pointer", className)}
      onClick={navigateRow}
    />
  );
}

/** Tarjeta de lista (celular) que navega al detalle con un clic en cualquier parte. */
export function ClickableItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      {...props}
      data-row-link=""
      className={cn("cursor-pointer", className)}
      onClick={navigateRow}
    />
  );
}
