"use client";

import { FileDown, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import type { WorkshopQuote } from "@/domain/quote-workshop-pdf";

import { exportWorkshopPdf } from "./quote-workshop-export";

/** Productos de la cotización (sin precios) y «PDF para taller», para logística. */
export function TrackingQuoteLines({ workshop }: { workshop: WorkshopQuote }) {
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      await exportWorkshopPdf([workshop]);
      toast.success("Orden para taller exportada.");
    } catch {
      toast.error("No se pudo exportar el PDF. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="productos-cotizacion" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="productos-cotizacion" className="text-heading font-semibold">
          Productos
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void exportPdf()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <FileDown className={PDF_ICON_CLASS} aria-hidden />
          )}
          PDF para taller
        </Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {workshop.lines.map((line) => (
          <li
            key={line.id}
            className="flex gap-3 p-3"
            data-testid="producto-cotizacion"
          >
            {line.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada o de Shopify
              <img
                src={line.image}
                alt=""
                className="size-16 shrink-0 rounded-md border object-cover"
              />
            ) : (
              <span className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md border">
                <Package aria-hidden className="size-6" />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-0.5 text-sm">
              <p className="font-medium">
                {line.title}
                {line.variantTitle ? ` · ${line.variantTitle}` : ""}
              </p>
              {line.sku ? (
                <p className="text-muted-foreground text-xs">SKU {line.sku}</p>
              ) : null}
              {line.customization ? (
                <p className="whitespace-pre-wrap">{line.customization}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-sm tabular-nums">
              × {line.quantity}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
