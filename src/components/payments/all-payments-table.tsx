import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { ClickableItem, ClickableRow } from "@/components/clickable-row";
import { ShopifyBadge } from "@/components/shopify-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/domain/money";
import { paymentShopifyLabel } from "@/domain/payments";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentListPage } from "@/server/payments/queries";

type Row = PaymentListPage["items"][number];

/** Monto con signo: los reembolsos restan (en rojo). */
function Amount({ payment: p }: { payment: Row }) {
  const refund = p.kind === "reembolso";
  return (
    <span className={cn("tabular-nums", refund && "text-destructive")}>
      {refund ? "−" : ""}
      {formatCents(p.amountCents)}
    </span>
  );
}

function Method({ payment: p }: { payment: Row }) {
  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        {p.methodName}
        {p.kind === "reembolso" ? (
          <Badge variant="destructive">Reembolso</Badge>
        ) : null}
      </span>
      {p.branchName ? (
        <span className="text-muted-foreground block text-xs">
          {p.branchName}
        </span>
      ) : null}
      {p.kind === "reembolso" && p.reason ? (
        <span className="text-muted-foreground block text-xs">{p.reason}</span>
      ) : null}
    </>
  );
}

/** Estado en Shopify; con su pedido, enlace al admin de Shopify. */
function Shopify({ payment: p }: { payment: Row }) {
  const label = paymentShopifyLabel(p);
  const muted = p.skipShopify || (p.source === "sistema" && !p.syncedToShopify);
  return (
    <>
      <ShopifyBadge
        className={
          muted ? "border-border text-foreground bg-transparent" : undefined
        }
      >
        {label}
      </ShopifyBadge>
      {p.orderUrl && p.orderName ? (
        <a
          href={p.orderUrl}
          target="_blank"
          rel="noreferrer"
          title="Abrir el pedido en Shopify (pestaña nueva)"
          className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs hover:underline"
        >
          Pedido {p.orderName}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </>
  );
}

/**
 * Pagos y reembolsos de todas las restauraciones (tarjetas en el celular). Cada fila
 * lleva a su restauración.
 */
export function AllPaymentsTable({
  payments,
  empty,
}: {
  payments: Row[];
  empty: React.ReactNode;
}) {
  if (payments.length === 0) return empty;
  return (
    <>
      <Table className="hidden md:table" aria-label="Pagos de restauraciones">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Restauración</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Método</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Registró</TableHead>
            <TableHead>Shopify</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <ClickableRow key={p.id} data-testid={`pago-${p.id}`}>
              <TableCell className="whitespace-nowrap">
                {formatDate(`${p.paidOn}T12:00:00`)}
              </TableCell>
              <TableCell>
                <Link
                  href={`/restauraciones/${p.restorationId}`}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {p.restorationCode}
                </Link>
              </TableCell>
              <TableCell className="max-w-56">
                <span className="block truncate">{p.clientName}</span>
                {p.documentNumber ? (
                  <span className="text-muted-foreground block text-xs">
                    {p.documentNumber}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <Method payment={p} />
              </TableCell>
              <TableCell className="text-right">
                <Amount payment={p} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {p.createdByName ?? "—"}
              </TableCell>
              <TableCell>
                <Shopify payment={p} />
              </TableCell>
            </ClickableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Pagos de restauraciones">
        {payments.map((p) => (
          <ClickableItem
            key={p.id}
            className="space-y-2 rounded-lg border p-4"
            data-testid={`pago-movil-${p.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/restauraciones/${p.restorationId}`}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {p.restorationCode}
                </Link>
                <p className="truncate text-sm">{p.clientName}</p>
              </div>
              <Amount payment={p} />
            </div>
            <div className="text-muted-foreground text-sm">
              {formatDate(`${p.paidOn}T12:00:00`)}
            </div>
            <div className="text-sm">
              <Method payment={p} />
            </div>
            <Shopify payment={p} />
          </ClickableItem>
        ))}
      </ul>
    </>
  );
}
