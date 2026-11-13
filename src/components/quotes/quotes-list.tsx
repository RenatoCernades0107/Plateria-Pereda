"use client";

import { FileDown, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ClickableItem, ClickableRow } from "@/components/clickable-row";
import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/domain/money";
import { formatQuoteDate } from "@/domain/quote";
import { formatDate } from "@/lib/format";
import { getWorkshopQuotes } from "@/server/quotes/actions";
import type { QuoteListItem } from "@/server/quotes/queries";

import { QuoteDeliveryDates } from "./quote-delivery-dates";
import { QuoteStatusBadge } from "./quote-status-badge";
import { QuoteTrackingText } from "./quote-tracking";
import { exportWorkshopPdf } from "./quote-workshop-export";

function Client({ quote }: { quote: QuoteListItem }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{quote.clientName}</span>
      {quote.contactName ? (
        <span className="text-muted-foreground truncate text-xs">
          Atención: {quote.contactName}
        </span>
      ) : null}
    </span>
  );
}

function Code({ quote }: { quote: QuoteListItem }) {
  return (
    <Link
      href={`/cotizaciones/${quote.id}`}
      data-primary-link
      className="text-heading font-medium underline-offset-4 hover:underline"
    >
      {quote.code}
    </Link>
  );
}

const dates = (quote: QuoteListItem) =>
  quote.issueDate
    ? `Emitida ${formatQuoteDate(quote.issueDate)}`
    : `Creada ${formatDate(quote.createdAt)}`;

/**
 * Barra de las cotizaciones elegidas: el contador, "Quitar selección" y "PDF para
 * taller" (la orden para taller de todas ellas, sin precios).
 */
export function WorkshopBar({
  chosen,
  total,
  onClear,
}: {
  chosen: string[];
  total: number;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const n = chosen.length;

  async function exportPdf() {
    setBusy(true);
    try {
      const result = await getWorkshopQuotes(chosen);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      await exportWorkshopPdf(result.quotes);
      toast.success(
        `Orden para taller exportada (${n === 1 ? "1 cotización" : `${n} cotizaciones`}).`,
      );
    } catch {
      toast.error("No se pudo exportar el PDF. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="bg-card border-primary/40 sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm"
      role="region"
      aria-label="Acciones para las cotizaciones elegidas"
    >
      <p
        className="mr-auto text-sm font-medium whitespace-nowrap"
        aria-live="polite"
      >
        {n} de {total} {total === 1 ? "seleccionada" : "seleccionadas"}
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={onClear}
        disabled={busy}
      >
        <X aria-hidden />
        Quitar selección
      </Button>
      <Button size="sm" onClick={() => void exportPdf()} disabled={busy}>
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <FileDown className={PDF_ICON_CLASS} />
        )}
        PDF para taller
      </Button>
    </div>
  );
}

/**
 * Listado de cotizaciones. Con `selectable` (página de Cotizaciones) cada una lleva su
 * casilla para exportar la orden para taller de las elegidas.
 */
export function QuotesList({
  quotes,
  emptyMessage,
  empty,
  selectable = false,
}: {
  quotes: QuoteListItem[];
  emptyMessage: string;
  /** Reemplaza el vacío por defecto (p. ej. el de "sin resultados" por filtros). */
  empty?: React.ReactNode;
  /** Casillas para exportar la orden para taller. */
  selectable?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  // Solo cuentan las de esta página (al cambiar de página o filtro, se descartan).
  const chosen = selected.filter((id) => quotes.some((q) => q.id === id));
  const allChosen = quotes.length > 0 && chosen.length === quotes.length;

  if (quotes.length === 0) {
    return empty ?? <EmptyState>{emptyMessage}</EmptyState>;
  }

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );
  const checkbox = (q: QuoteListItem) => (
    <input
      type="checkbox"
      className="accent-primary size-4"
      aria-label={`Elegir ${q.code}`}
      checked={chosen.includes(q.id)}
      onChange={(e) => toggle(q.id, e.target.checked)}
    />
  );

  return (
    <>
      {selectable && chosen.length > 0 ? (
        <WorkshopBar
          chosen={chosen}
          total={quotes.length}
          onClear={() => setSelected([])}
        />
      ) : null}
      {selectable ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allChosen}
            onChange={(e) =>
              setSelected(e.target.checked ? quotes.map((q) => q.id) : [])
            }
          />
          Elegir todas las de esta página
        </label>
      ) : null}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            {selectable ? (
              <TableHead className="w-8">
                <span className="sr-only">Elegir</span>
              </TableHead>
            ) : null}
            <TableHead>Código</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Vigente hasta</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((q) => (
            <ClickableRow key={q.id} data-testid={`cotizacion-${q.code}`}>
              {selectable ? <TableCell>{checkbox(q)}</TableCell> : null}
              <TableCell>
                <Code quote={q} />
              </TableCell>
              <TableCell className="max-w-64">
                <Client quote={q} />
              </TableCell>
              <TableCell>
                <QuoteStatusBadge status={q.status} />
              </TableCell>
              <TableCell>
                <span className="flex flex-col gap-0.5">
                  <span>{dates(q)}</span>
                  <QuoteDeliveryDates
                    deliveryDate={q.deliveryDate}
                    supplierDeliveryDate={q.supplierDeliveryDate}
                  />
                  <QuoteTrackingText
                    workLocation={q.workLocation}
                    workshopName={q.workshopName}
                  />
                </span>
              </TableCell>
              <TableCell>
                {q.validUntil ? formatQuoteDate(q.validUntil) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(q.total)}
              </TableCell>
            </ClickableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Cotizaciones">
        {quotes.map((q) => (
          <ClickableItem
            key={q.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`cotizacion-movil-${q.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2">
                {selectable ? checkbox(q) : null}
                <Code quote={q} />
              </span>
              <QuoteStatusBadge status={q.status} />
            </div>
            <Client quote={q} />
            <QuoteDeliveryDates
              deliveryDate={q.deliveryDate}
              supplierDeliveryDate={q.supplierDeliveryDate}
            />
            <QuoteTrackingText
              workLocation={q.workLocation}
              workshopName={q.workshopName}
              className="block"
            />
            <div className="text-muted-foreground flex justify-between gap-2 text-sm">
              <span>{dates(q)}</span>
              <span className="text-foreground font-medium tabular-nums">
                {formatCents(q.total)}
              </span>
            </div>
          </ClickableItem>
        ))}
      </ul>
    </>
  );
}
