import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import type { SyncErrorSummary } from "@/server/shopify-sync/errors";

/**
 * Aviso del admin: sincronizaciones con Shopify que quedaron en error (Paso 15.4).
 * Cada enlace lleva al registro, donde está "Reintentar".
 */
export function SyncErrorsBanner({ total, links }: SyncErrorSummary) {
  if (total === 0) return null;
  const rest = total - links.length;
  return (
    <section
      aria-labelledby="sync-errors-title"
      className="border-destructive/40 bg-destructive/5 mb-4 flex gap-3 rounded-lg border p-3 text-sm"
    >
      <TriangleAlert
        aria-hidden
        className="text-destructive mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0 space-y-1">
        <h2 id="sync-errors-title" className="font-medium">
          {total === 1
            ? "1 sincronización con Shopify quedó en error"
            : `${total} sincronizaciones con Shopify quedaron en error`}
        </h2>
        <p className="text-muted-foreground">
          Shopify no tiene estos cambios. Abre cada registro y usa «Reintentar».
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((link) => (
            <li key={link.jobId} className="min-w-0 break-words">
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
      </div>
    </section>
  );
}
