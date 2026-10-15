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
import { formatQuoteDate } from "@/domain/quote";
import { formatDate } from "@/lib/format";
import type { QuoteListItem } from "@/server/quotes/queries";

import { QuoteStatusBadge } from "./quote-status-badge";

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

export function QuotesList({
  quotes,
  emptyMessage,
  empty,
}: {
  quotes: QuoteListItem[];
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
              <TableCell>
                <Code quote={q} />
              </TableCell>
              <TableCell className="max-w-64">
                <Client quote={q} />
              </TableCell>
              <TableCell>
                <QuoteStatusBadge status={q.status} />
              </TableCell>
              <TableCell>{dates(q)}</TableCell>
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
              <Code quote={q} />
              <QuoteStatusBadge status={q.status} />
            </div>
            <Client quote={q} />
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
