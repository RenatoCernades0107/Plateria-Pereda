import Link from "next/link";

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
}: {
  quotes: QuoteListItem[];
  emptyMessage: string;
}) {
  if (quotes.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        {emptyMessage}
      </p>
    );
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
            <TableRow key={q.id} data-testid={`cotizacion-${q.code}`}>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Cotizaciones">
        {quotes.map((q) => (
          <li
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
          </li>
        ))}
      </ul>
    </>
  );
}
