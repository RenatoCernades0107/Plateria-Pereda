"use client";

import Link from "next/link";

import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SyncErrorSummary } from "@/server/shopify-sync/errors";

/** "1 sincronización con Shopify en error" (también para lectores de pantalla). */
export function syncErrorsLabel(total: number): string {
  return total === 1
    ? "1 sincronización con Shopify en error"
    : `${total} sincronizaciones con Shopify en error`;
}

/**
 * Aviso del admin en el encabezado (Paso 15.4): las sincronizaciones con Shopify que
 * quedaron en error, con enlace al registro, donde está «Reintentar». Va junto a la
 * campana para no empujar el contenido de la página.
 */
export function SyncErrorsIndicator({ total, links }: SyncErrorSummary) {
  if (total === 0) return null;
  const rest = total - links.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive relative"
          aria-label={syncErrorsLabel(total)}
        >
          <ShopifyIcon />
          <span
            aria-hidden
            className="bg-destructive absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white"
          >
            {total > 9 ? "9+" : total}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-sm">
        <p className="font-medium">{syncErrorsLabel(total)}</p>
        <p className="text-muted-foreground">
          Shopify no tiene estos cambios. Abre cada registro y usa «Reintentar».
        </p>
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.jobId} className="break-words">
              {link.href ? (
                <Link href={link.href} className="underline underline-offset-4">
                  {link.label}
                </Link>
              ) : (
                link.label
              )}
            </li>
          ))}
          {rest > 0 && <li className="text-muted-foreground">y {rest} más</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
