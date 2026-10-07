import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCents,
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
} from "@/domain/money";
import {
  restorationFiltersHref,
  sortChange,
  type RestorationFilters,
  type RestorationSort,
} from "@/domain/restoration-filters";
import { formatDate } from "@/lib/format";
import type { RestorationListItem } from "@/server/restorations/queries";

import { RestorationStatusBadge } from "./status-badges";

function SortHeader({
  filters,
  sort,
  children,
}: {
  filters: RestorationFilters;
  sort: RestorationSort;
  children: React.ReactNode;
}) {
  const active = filters.sort === sort;
  const Icon = filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={restorationFiltersHref(filters, sortChange(filters, sort))}
      className="inline-flex items-center gap-1 hover:underline"
      aria-label={`Ordenar por ${String(children).toLowerCase()}`}
    >
      {children}
      {active ? <Icon className="size-3.5" aria-hidden /> : null}
    </Link>
  );
}

function Payment({ item }: { item: RestorationListItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      {item.paymentStatus ? (
        <Badge variant="outline">
          {PAYMENT_STATUS_LABELS[item.paymentStatus]}
        </Badge>
      ) : null}
      <span className="text-muted-foreground text-xs">
        {PAYMENT_TYPE_LABELS[item.paymentType]}
      </span>
      {item.origin === "whatsapp" ? (
        <Badge variant="secondary" data-origin="whatsapp">
          WhatsApp
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * Tabla de restauraciones (tarjetas en el celular). Los montos solo llegan para
 * admin y ventas; para logística las columnas no se muestran (P42).
 */
export function RestorationsList({
  items,
  filters,
  showMoney,
  emptyMessage,
}: {
  items: RestorationListItem[];
  filters: RestorationFilters;
  showMoney: boolean;
  emptyMessage: string;
}) {
  if (items.length === 0) {
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
            <TableHead>Pago</TableHead>
            <TableHead className="text-right">Piezas</TableHead>
            {showMoney ? (
              <>
                <TableHead className="text-right">
                  <SortHeader filters={filters} sort="total">
                    Total
                  </SortHeader>
                </TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id} data-testid={`restauracion-${r.code}`}>
              <TableCell>
                <Link
                  href={`/restauraciones/${r.id}`}
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {r.code}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(r.createdAt)}
              </TableCell>
              <TableCell className="max-w-56">
                <span className="block truncate">{r.clientName}</span>
                {r.contactName ? (
                  <span className="text-muted-foreground block truncate text-xs">
                    {r.contactName}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <RestorationStatusBadge status={r.status} />
              </TableCell>
              <TableCell>
                <Payment item={r} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.piecesCount}
              </TableCell>
              {showMoney ? (
                <>
                  <TableCell className="text-right tabular-nums">
                    {r.totalCents === null ? "—" : formatCents(r.totalCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.balanceCents === null
                      ? "—"
                      : formatCents(r.balanceCents)}
                  </TableCell>
                </>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Restauraciones">
        {items.map((r) => (
          <li
            key={r.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`restauracion-movil-${r.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/restauraciones/${r.id}`}
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {r.code}
                </Link>
                <p className="truncate text-sm">{r.clientName}</p>
              </div>
              <RestorationStatusBadge status={r.status} />
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>{formatDate(r.createdAt)}</span>
              <span>
                {r.piecesCount} {r.piecesCount === 1 ? "pieza" : "piezas"}
              </span>
              {showMoney && r.totalCents !== null ? (
                <span>Total {formatCents(r.totalCents)}</span>
              ) : null}
            </div>
            <Payment item={r} />
          </li>
        ))}
      </ul>
    </>
  );
}
