import {
  formatCents,
  lineCents,
  unitShareCents,
  type Cents,
} from "@/domain/money";
import { cn } from "@/lib/utils";

import { SalePriceCell, ServiceCostCell } from "./piece-money-cells";

type MoneyPiece = { id: string; code: string; restorationId: string };

/**
 * Montos de la pieza en el detalle (P55), como tarjetas de cifras: precio de venta
 * (admin, ventas y logística), costo de servicio (admin y logística), margen (quien ve
 * ambos y `showMargin`: logística no) y el saldo de la guía. Cada rol solo recibe lo
 * que puede ver: lo que llega en null no se muestra.
 */
export function PieceMoneyTiles({
  piece,
  sale,
  costCents,
  quantity = 1,
  showMargin = true,
  guide,
  className,
}: {
  piece: MoneyPiece;
  /** Precio de venta; null si el rol no lo ve. */
  sale: {
    cents: Cents | null;
    hasOrder: boolean;
    editable: boolean;
  } | null;
  /** Costo de servicio; undefined si el rol no lo ve (null = por definir). */
  costCents: Cents | null | undefined;
  /**
   * Unidades de la pieza: el precio es por unidad y el costo de la pieza completa. Se
   * muestran el importe (precio × cantidad, con techo al sol) y el margen sobre él.
   */
  quantity?: number;
  /** Margen (importe − costo): solo quien ve el dinero de la guía (no logística). */
  showMargin?: boolean;
  /** Total y pagado de la guía; null si el rol no ve pagos. */
  guide: { totalCents: Cents; paidCents: Cents } | null;
  className?: string;
}) {
  const showCost = costCents !== undefined;
  const several = quantity > 1;
  // Margen: importe de venta (todas las unidades) menos el costo del taller, que es de
  // la pieza completa (solo con ambos montos).
  const margin =
    showMargin && sale && sale.cents !== null && showCost && costCents !== null
      ? lineCents(sale.cents, quantity) - costCents
      : null;
  const balance = guide ? guide.totalCents - guide.paidCents : null;

  return (
    <dl
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}
      data-testid="montos-pieza"
    >
      {sale ? (
        <Tile label="Precio de venta">
          <SalePriceCell
            piece={piece}
            cents={sale.cents}
            quantity={quantity}
            hasOrder={sale.hasOrder}
            editable={sale.editable}
            align="start"
            emptyAsButton
          />
        </Tile>
      ) : null}
      {showCost ? (
        <Tile label="Costo de servicio">
          <ServiceCostCell
            piece={piece}
            cents={costCents}
            quantity={quantity}
            align="start"
            emptyAsButton
          />
        </Tile>
      ) : null}
      {margin !== null ? (
        <Tile label="Margen">
          <span
            className={cn("tabular-nums", margin < 0 && "text-destructive")}
          >
            {formatCents(margin)}
          </span>
          <Hint>
            {several
              ? `${formatCents(unitShareCents(margin, quantity))} c/u · Venta total − costo`
              : "Precio de venta − costo"}
          </Hint>
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

function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-md border px-3 py-2">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="flex min-h-8 flex-col items-start justify-center text-lg font-semibold">
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
