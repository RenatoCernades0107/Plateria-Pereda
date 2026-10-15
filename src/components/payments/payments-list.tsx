import { EmptyState } from "@/components/empty-state";
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
import { formatDate } from "@/lib/format";
import type { PaymentRecord } from "@/server/payments/queries";

/** Estado de envío a Shopify de cada pago (§7.5). */
export function shopifyLabel(p: PaymentRecord): string {
  if (p.source === "shopify") return "Hecho en Shopify";
  return p.syncedToShopify ? "En Shopify" : "Pendiente de envío";
}

/** Historial de pagos y reembolsos (Pasos 11.2 y 11.4). */
export function PaymentsList({ payments }: { payments: PaymentRecord[] }) {
  if (payments.length === 0)
    return <EmptyState>Aún no hay pagos registrados.</EmptyState>;
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
                </>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {p.kind === "reembolso" ? "−" : ""}
              {formatCents(p.amountCents)}
            </TableCell>
            <TableCell>{p.createdByName ?? "Shopify"}</TableCell>
            <TableCell>
              <ShopifyBadge
                className={
                  p.source === "sistema" && !p.syncedToShopify
                    ? "border-border text-foreground bg-transparent"
                    : undefined
                }
              >
                {shopifyLabel(p)}
              </ShopifyBadge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
