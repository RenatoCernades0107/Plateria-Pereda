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
import { formatPhone } from "@/domain/phone";
import { quoteAge } from "@/domain/whatsapp-quotes";
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

/**
 * Cotizaciones de WhatsApp (P46): una vista propia, nunca mezclada con las
 * restauraciones. Tabla en escritorio y tarjetas en el celular.
 */
export function WhatsappQuotesList({
  quotes,
  now,
  emptyMessage,
}: {
  quotes: WhatsappQuoteListItem[];
  /** Para la antigüedad ("hace 3 días"); se pasa desde el servidor. */
  now: Date;
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
      <ul className="space-y-2 md:hidden">
        {quotes.map((q) => (
          <li
            key={q.id}
            className="rounded-lg border p-3"
            data-testid={`cotizacion-${q.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/cotizaciones-whatsapp/${q.id}`}
                className="text-heading font-medium underline-offset-4 hover:underline"
              >
                {q.code}
              </Link>
              <WhatsappQuoteStatusBadge status={q.status} />
            </div>
            <p className="text-sm break-words">{who(q)}</p>
            <p className="text-muted-foreground text-xs">
              {pending(q)} · {quoteAge(new Date(q.createdAt), now)}
            </p>
            <p className="text-sm font-medium tabular-nums">
              {formatCents(q.totalCents)}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Piezas</TableHead>
              <TableHead>Cotizada</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((q) => (
              <TableRow key={q.id} data-testid={`cotizacion-${q.code}`}>
                <TableCell>
                  <Link
                    href={`/cotizaciones-whatsapp/${q.id}`}
                    className="text-heading font-medium underline-offset-4 hover:underline"
                  >
                    {q.code}
                  </Link>
                </TableCell>
                <TableCell className="max-w-64 truncate">{who(q)}</TableCell>
                <TableCell>
                  <WhatsappQuoteStatusBadge status={q.status} />
                </TableCell>
                <TableCell>{pending(q)}</TableCell>
                <TableCell>{quoteAge(new Date(q.createdAt), now)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(q.totalCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
