import { formatCents, type Cents } from "@/domain/money";
import { cn } from "@/lib/utils";

/**
 * Total, pagado y saldo de una restauración (Paso 7.6). Logística no ve montos
 * (P42): la página no debe renderizar este componente para ese rol.
 */
export function MoneySummary({
  totalCents,
  paidCents,
  className,
}: {
  totalCents: Cents;
  /** Pagos − reembolsos (§7.5). */
  paidCents: Cents;
  className?: string;
}) {
  const balance = totalCents - paidCents;
  const items = [
    { label: "Total", value: totalCents, testId: "monto-total" },
    { label: "Pagado", value: paidCents, testId: "monto-pagado" },
    balance < 0
      ? { label: "A favor del cliente", value: -balance, testId: "monto-saldo" }
      : { label: "Saldo", value: balance, testId: "monto-saldo" },
  ];
  return (
    <dl className={cn("grid grid-cols-3 gap-3", className)}>
      {items.map((item) => (
        <div key={item.testId} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd
            data-testid={item.testId}
            className={cn(
              "truncate font-medium tabular-nums",
              item.testId === "monto-saldo" &&
                balance > 0 &&
                "text-heading font-semibold",
            )}
          >
            {formatCents(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
