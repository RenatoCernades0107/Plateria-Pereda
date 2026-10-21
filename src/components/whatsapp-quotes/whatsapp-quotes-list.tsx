import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ClickableItem, ClickableRow } from "@/components/clickable-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/domain/money";
import { formatPhone } from "@/domain/phone";
import {
  quoteAge,
  whatsappQuoteFiltersHref,
  whatsappQuoteSortChange,
  type WhatsappQuoteFilters,
  type WhatsappQuoteSort,
} from "@/domain/whatsapp-quotes";
import { formatDate } from "@/lib/format";
import type { WhatsappQuoteListItem } from "@/server/whatsapp-quotes/queries";

import { WhatsappQuoteStatusBadge } from "./status-badge";

function who(quote: WhatsappQuoteListItem) {
  if (quote.name) return quote.name;
  if (quote.customerPhone) return formatPhone(quote.customerPhone);
  return "Sin cliente";
}

function pending(quote: WhatsappQuoteListItem) {
  return quote.pendingCount === 0
    ? "Todas pedidas"
    : `${quote.pendingCount} de ${quote.itemsCount} pendientes`;
}

function SortHeader({
  filters,
  sort,
  children,
}: {
  filters: WhatsappQuoteFilters;
  sort: WhatsappQuoteSort;
  children: React.ReactNode;
}) {
  const active = filters.sort === sort;
  const Icon = filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={whatsappQuoteFiltersHref(
        filters,
        whatsappQuoteSortChange(filters, sort),
      )}
      className="inline-flex items-center gap-1 hover:underline"
      aria-label={`Ordenar por ${String(children).toLowerCase()}`}
    >
      {children}
      {active ? <Icon className="size-3.5" aria-hidden /> : null}
    </Link>
  );
}

/**
 * Cotizaciones de WhatsApp (P46): una vista propia, nunca mezclada con las
 * restauraciones, con el mismo aspecto que su listado. Tabla en escritorio (con
 * columnas ordenables) y tarjetas en el celular.
 */
export function WhatsappQuotesList({
  quotes,
  filters,
  now,
  emptyMessage,
  empty,
}: {
  quotes: WhatsappQuoteListItem[];
  filters: WhatsappQuoteFilters;
  /** Para la antigüedad ("hace 3 días"); se pasa desde el servidor. */
  now: Date;
  emptyMessage: string;
  /** Reemplaza el vacío por defecto (p. ej. el de "sin resultados" por filtros). */
  empty?: React.ReactNode;
}) {
  if (quotes.length === 0) {
    return empty ?? <EmptyState>{emptyMessage}</EmptyState>;
  }
  return (
    <>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortHeader filters={filters} sort="code">
                Código
              </SortHeader>
            </TableHead>
            <TableHead>
              <SortHeader filters={filters} sort="created_at">
                Fecha
              </SortHeader>
            </TableHead>
            <TableHead>
              <SortHeader filters={filters} sort="client">
                Cliente
              </SortHeader>
            </TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Piezas</TableHead>
            <TableHead className="text-right">
              <SortHeader filters={filters} sort="total">
                Total
              </SortHeader>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((q) => (
            <ClickableRow key={q.id} data-testid={`cotizacion-${q.code}`}>
              <TableCell>
                <Link
                  href={`/cotizaciones-whatsapp/${q.id}`}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {q.code}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(q.createdAt)}
                <span className="text-muted-foreground block text-xs">
                  {quoteAge(new Date(q.createdAt), now)}
                </span>
              </TableCell>
              <TableCell className="max-w-56">
                <span className="block truncate">{who(q)}</span>
                {q.contactName ? (
                  <span className="text-muted-foreground block truncate text-xs">
                    {q.contactName}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <WhatsappQuoteStatusBadge status={q.status} />
              </TableCell>
              <TableCell className="text-sm">{pending(q)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(q.totalCents)}
              </TableCell>
            </ClickableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Cotizaciones de WhatsApp">
        {quotes.map((q) => (
          <ClickableItem
            key={q.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`cotizacion-movil-${q.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/cotizaciones-whatsapp/${q.id}`}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {q.code}
                </Link>
                <p className="truncate text-sm">{who(q)}</p>
              </div>
              <WhatsappQuoteStatusBadge status={q.status} />
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>{formatDate(q.createdAt)}</span>
              <span>{pending(q)}</span>
              <span>Total {formatCents(q.totalCents)}</span>
            </div>
          </ClickableItem>
        ))}
      </ul>
    </>
  );
}
