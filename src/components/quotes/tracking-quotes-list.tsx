"use client";

import Link from "next/link";
import { useState } from "react";

import { ClickableItem, ClickableRow } from "@/components/clickable-row";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TrackingQuoteItem } from "@/server/quotes/queries";

import { QuoteDeliveryDates } from "./quote-delivery-dates";
import { QuoteStatusBadge } from "./quote-status-badge";
import { QuoteTrackingText } from "./quote-tracking";
import { WorkshopBar } from "./quotes-list";

function Code({ quote }: { quote: TrackingQuoteItem }) {
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

/**
 * Cotizaciones aprobadas (aceptadas y facturadas) para el seguimiento de logística:
 * cliente, fechas de entrega, taller y ubicación, sin dinero. Con las casillas se
 * exporta la orden para taller de las elegidas.
 */
export function TrackingQuotesList({
  quotes,
  empty,
}: {
  quotes: TrackingQuoteItem[];
  empty: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = selected.filter((id) => quotes.some((q) => q.id === id));
  const allChosen = quotes.length > 0 && chosen.length === quotes.length;

  if (quotes.length === 0)
    return empty ?? <EmptyState>Sin resultados.</EmptyState>;

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );
  const checkbox = (q: TrackingQuoteItem) => (
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
      {chosen.length > 0 ? (
        <WorkshopBar
          chosen={chosen}
          total={quotes.length}
          onClear={() => setSelected([])}
        />
      ) : null}
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
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">Elegir</span>
            </TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead>Taller y ubicación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((q) => (
            <ClickableRow key={q.id} data-testid={`cotizacion-${q.code}`}>
              <TableCell>{checkbox(q)}</TableCell>
              <TableCell>
                <Code quote={q} />
              </TableCell>
              <TableCell className="max-w-64 truncate">
                {q.clientName}
              </TableCell>
              <TableCell>
                <QuoteStatusBadge status={q.status} />
              </TableCell>
              <TableCell>
                <QuoteDeliveryDates
                  deliveryDate={q.deliveryDate}
                  supplierDeliveryDate={q.supplierDeliveryDate}
                />
              </TableCell>
              <TableCell>
                {q.workLocation || q.workshopName ? (
                  <QuoteTrackingText
                    workLocation={q.workLocation}
                    workshopName={q.workshopName}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Sin taller ni ubicación
                  </span>
                )}
              </TableCell>
            </ClickableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Cotizaciones aprobadas">
        {quotes.map((q) => (
          <ClickableItem
            key={q.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`cotizacion-movil-${q.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2">
                {checkbox(q)}
                <Code quote={q} />
              </span>
              <QuoteStatusBadge status={q.status} />
            </div>
            <p className="truncate text-sm">{q.clientName}</p>
            <QuoteDeliveryDates
              deliveryDate={q.deliveryDate}
              supplierDeliveryDate={q.supplierDeliveryDate}
            />
            <QuoteTrackingText
              workLocation={q.workLocation}
              workshopName={q.workshopName}
              className="block"
            />
          </ClickableItem>
        ))}
      </ul>
    </>
  );
}
