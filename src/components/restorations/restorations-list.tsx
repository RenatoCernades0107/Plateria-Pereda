import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { WhatsAppBadge } from "@/components/whatsapp-badge";
import { ClickableItem, ClickableRow } from "@/components/clickable-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, PAYMENT_TYPE_LABELS } from "@/domain/money";
import {
  restorationFiltersHref,
  sortChange,
  type RestorationFilters,
  type RestorationSort,
} from "@/domain/restoration-filters";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RestorationListItem } from "@/server/restorations/queries";

import {
  ObservedBadge,
  PaymentStatusBadge,
  RestorationStatusBadge,
  WaitingClientBadge,
} from "./status-badges";

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

/**
 * Estado de la restauración y, si hay piezas en Observación o esperando la respuesta
 * del cliente, cuántas son.
 */
function Status({
  item,
  className,
}: {
  item: RestorationListItem;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <RestorationStatusBadge status={item.status} />
      {item.observed ? <ObservedBadge progress={item.observed} /> : null}
      <WaitingClientBadge count={item.waitingCount} />
    </span>
  );
}

function Payment({ item }: { item: RestorationListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {item.paymentStatus ? (
        <PaymentStatusBadge status={item.paymentStatus} />
      ) : null}
      <span className="text-muted-foreground text-xs">
        {PAYMENT_TYPE_LABELS[item.paymentType]}
      </span>
      {item.origin === "whatsapp" ? (
        <WhatsAppBadge data-origin="whatsapp">WhatsApp</WhatsAppBadge>
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
  showClient = true,
  emptyMessage,
  emptyAction,
  empty,
}: {
  items: RestorationListItem[];
  filters: RestorationFilters;
  showMoney: boolean;
  /** Logística no ve clientes: sin la columna ni el nombre en las tarjetas. */
  showClient?: boolean;
  emptyMessage: string;
  /** Salida del vacío: limpiar los filtros o registrar la primera. */
  emptyAction?: React.ReactNode;
  /** Reemplaza el vacío por defecto (p. ej. el de "sin resultados" por filtros). */
  empty?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      empty ?? <EmptyState action={emptyAction}>{emptyMessage}</EmptyState>
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
            {showClient ? (
              <TableHead>
                <SortHeader filters={filters} sort="client">
                  Cliente
                </SortHeader>
              </TableHead>
            ) : null}
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
            <ClickableRow key={r.id} data-testid={`restauracion-${r.code}`}>
              <TableCell>
                <Link
                  href={`/restauraciones/${r.id}`}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {r.code}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(r.createdAt)}
              </TableCell>
              {showClient ? (
                <TableCell className="max-w-56">
                  <span className="block truncate">{r.clientName}</span>
                  {r.contactName ? (
                    <span className="text-muted-foreground block truncate text-xs">
                      {r.contactName}
                    </span>
                  ) : null}
                </TableCell>
              ) : null}
              <TableCell>
                <Status item={r} />
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
            </ClickableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Restauraciones">
        {items.map((r) => (
          <ClickableItem
            key={r.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`restauracion-movil-${r.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/restauraciones/${r.id}`}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {r.code}
                </Link>
                {showClient ? (
                  <p className="truncate text-sm">{r.clientName}</p>
                ) : null}
              </div>
              <Status item={r} className="justify-end" />
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
          </ClickableItem>
        ))}
      </ul>
    </>
  );
}
