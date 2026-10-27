import { ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { SHOPIFY_BADGE_CLASS, ShopifyBadge } from "@/components/shopify-badge";
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
import { formatDate } from "@/lib/format";
import type { PaymentRecord } from "@/server/payments/queries";

/** Estado de envío a Shopify de cada pago (§7.5); con su pedido, su descripción. */
export function shopifyLabel(p: PaymentRecord): string {
  if (p.source === "shopify") return "Hecho en Shopify";
  if (p.orderName) return p.orderTitle ?? p.orderName;
  return p.syncedToShopify ? "En Shopify" : "Pendiente de envío";
}

/** Estado en Shopify; el pedido del pago, con enlace a su admin si lo hay. */
function ShopifyCell({ payment: p }: { payment: PaymentRecord }) {
  const label = shopifyLabel(p);
  if (p.orderUrl)
    return (
      <>
        <Badge variant="outline" asChild className={SHOPIFY_BADGE_CLASS}>
          <a
            href={p.orderUrl}
            target="_blank"
            rel="noreferrer"
            title="Abrir el pedido en Shopify (pestaña nueva)"
            data-testid="pedido-shopify"
          >
            <ShopifyIcon />
            {label}
            <ExternalLink aria-hidden />
          </a>
        </Badge>
        {p.orderName ? (
          <span className="text-muted-foreground block text-xs">
            Pedido {p.orderName}
          </span>
        ) : null}
      </>
    );
  const pending = p.source === "sistema" && !p.syncedToShopify;
  return (
    <>
      <ShopifyBadge
        className={
          pending ? "border-border text-foreground bg-transparent" : undefined
        }
      >
        {label}
      </ShopifyBadge>
      {pending && p.orderTitle ? (
        <span className="text-muted-foreground block text-xs">
          {p.orderTitle}
        </span>
      ) : null}
    </>
  );
}

/** Historial de pagos y reembolsos (Pasos 11.2 y 11.4). */
export function PaymentsList({ payments }: { payments: PaymentRecord[] }) {
  if (payments.length === 0)
    return <EmptyState>Aún no hay pagos registrados.</EmptyState>;
  const byId = new Map(payments.map((p) => [p.id, p]));
  const refundedOf = (p: PaymentRecord) => {
    const target = p.refundedPaymentId && byId.get(p.refundedPaymentId);
    return target ? (target.orderTitle ?? target.orderName) : null;
  };
  return (
    <Table aria-label="Historial de pagos">
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Método</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Registró</TableHead>
          <TableHead>Shopify</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id} data-testid="pago">
            <TableCell>{formatDate(`${p.paidOn}T12:00:00`)}</TableCell>
            <TableCell>
              {p.methodName}
              {p.kind === "reembolso" ? (
                <>
                  {" "}
                  <Badge variant="destructive">Reembolso</Badge>
                  <span className="text-muted-foreground block text-xs">
                    {p.reason}
                  </span>
                  {refundedOf(p) ? (
                    <span className="text-muted-foreground block text-xs">
                      De {refundedOf(p)}
                    </span>
                  ) : null}
                </>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {p.kind === "reembolso" ? "−" : ""}
              {formatCents(p.amountCents)}
            </TableCell>
            <TableCell>{p.createdByName ?? "Shopify"}</TableCell>
            <TableCell>
              <ShopifyCell payment={p} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
