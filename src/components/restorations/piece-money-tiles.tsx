import { igvBreakdown, IGV_PERCENT, priceWithIgv } from "@/domain/igv";
import { formatCents, type Cents } from "@/domain/money";
import { cn } from "@/lib/utils";

import { SalePriceCell, ServiceCostCell } from "./piece-money-cells";

type MoneyPiece = { id: string; code: string; restorationId: string };

/**
 * Montos de la pieza en el detalle (P55), como tarjetas de cifras: precio de venta
 * (admin y ventas), costo de servicio (admin y logística), margen (quien ve ambos) y
 * el saldo de la guía. Cada rol solo recibe lo que puede ver: lo que llega en null no
 * se muestra.
 */
export function PieceMoneyTiles({
  piece,
  sale,
  costCents,
  guide,
  stackOnWide = false,
  className,
}: {
  piece: MoneyPiece;
  /** Precio de venta; null si el rol no lo ve. */
  sale: {
    cents: Cents | null;
    hasOrder: boolean;
    editable: boolean;
    pricesIncludeIgv: boolean | null;
  } | null;
  /** Costo de servicio; undefined si el rol no lo ve (null = por definir). */
  costCents: Cents | null | undefined;
  /** Total y pagado de la guía; null si el rol no ve pagos. */
  guide: { totalCents: Cents; paidCents: Cents } | null;
  /**
   * En pantallas anchas (columna angosta de la ficha), un monto por fila
   * («Precio de venta … S/ 90.00»), como el resumen de la guía.
   */
  stackOnWide?: boolean;
  className?: string;
}) {
  const showCost = costCents !== undefined;
  // Margen: precio sin IGV menos el costo del taller (solo con ambos montos).
  const margin =
    sale && sale.cents !== null && showCost && costCents !== null
      ? (sale.pricesIncludeIgv === false
          ? sale.cents
          : igvBreakdown(sale.cents).taxableBase) - costCents
      : null;
  const balance = guide ? guide.totalCents - guide.paidCents : null;

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3",
        stackOnWide && "wide:grid-cols-1 wide:gap-0 wide:divide-y",
        className,
      )}
      data-testid="montos-pieza"
      data-stack={stackOnWide ? "" : undefined}
    >
      {sale ? (
        <Tile label="Precio de venta">
          <SalePriceCell
            piece={piece}
            cents={sale.cents}
            hasOrder={sale.hasOrder}
            editable={sale.editable}
            align="start"
          />
          {sale.cents !== null && sale.pricesIncludeIgv !== null ? (
            <Hint>
              {sale.pricesIncludeIgv
                ? "IGV incluido"
                : `Con IGV (${IGV_PERCENT} %): ${formatCents(
                    priceWithIgv(sale.cents, false),
                  )}`}
            </Hint>
          ) : null}
        </Tile>
      ) : null}
      {showCost ? (
        <Tile label="Costo de servicio">
          <ServiceCostCell piece={piece} cents={costCents} align="start" />
        </Tile>
      ) : null}
      {margin !== null ? (
        <Tile label="Margen">
          <span
            className={cn("tabular-nums", margin < 0 && "text-destructive")}
          >
            {formatCents(margin)}
          </span>
          <Hint>Precio sin IGV − costo</Hint>
        </Tile>
      ) : null}
      {guide && balance !== null ? (
        <Tile label={balance < 0 ? "A favor del cliente" : "Saldo de la guía"}>
          <span
            className={cn("tabular-nums", balance > 0 && "text-heading")}
            data-testid="saldo-guia"
          >
            {formatCents(Math.abs(balance))}
          </span>
          <Hint>
            Pagado {formatCents(guide.paidCents)} de{" "}
            {formatCents(guide.totalCents)}
          </Hint>
        </Tile>
      ) : null}
    </dl>
  );
}

/**
 * Una cifra. Dentro de una lista con `data-stack`, desde `wide` pasa a fila: rótulo a
 * la izquierda y monto (con su ayuda) a la derecha.
 */
function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 in-data-stack:wide:flex in-data-stack:wide:items-start in-data-stack:wide:justify-between in-data-stack:wide:gap-3 in-data-stack:wide:rounded-none in-data-stack:wide:border-0 in-data-stack:wide:bg-transparent in-data-stack:wide:px-0 min-w-0 rounded-md border px-3 py-2">
      <dt className="text-muted-foreground in-data-stack:wide:shrink-0 in-data-stack:wide:pt-1 text-xs font-medium">
        {label}
      </dt>
      <dd className="in-data-stack:wide:items-end in-data-stack:wide:text-base in-data-stack:wide:text-right flex min-h-8 flex-col items-start justify-center text-lg font-semibold">
        {children}
      </dd>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-xs font-normal">
      {children}
    </span>
  );
}
