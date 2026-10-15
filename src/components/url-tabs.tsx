"use client";

import type { ComponentProps } from "react";

import { Tabs } from "@/components/ui/tabs";

/**
 * Pestañas que recuerdan la elegida en la URL (`?pestana=pagos`) sin recargar: al
 * volver o recargar se abre la misma y se puede compartir el enlace. La primera
 * (`initial`) no se escribe en la URL.
 */
export function UrlTabs({
  param = "pestana",
  initial,
  ...props
}: Omit<ComponentProps<typeof Tabs>, "onValueChange" | "value"> & {
  param?: string;
  /** Pestaña por defecto (sin parámetro en la URL). */
  initial: string;
}) {
  return (
    <Tabs
      {...props}
      onValueChange={(value) => {
        const url = new URL(window.location.href);
        if (value === initial) url.searchParams.delete(param);
        else url.searchParams.set(param, value);
        window.history.replaceState(null, "", url);
      }}
    />
  );
}
