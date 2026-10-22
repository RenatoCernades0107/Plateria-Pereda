import { Gem } from "lucide-react";
import Link from "next/link";

import { PIECE_ACCENT_CLASS } from "@/components/restorations/guide-labels";
import {
  materialSummary,
  PiecePhoto,
} from "@/components/restorations/piece-photo";
import { PieceQuantity } from "@/components/restorations/status-badges";
import { RT } from "@/components/restorations/responsive-table";
import { Badge } from "@/components/ui/badge";
import { formatCents, lineCents } from "@/domain/money";
import { cn } from "@/lib/utils";
import type { WhatsappQuoteItem } from "@/server/whatsapp-quotes/queries";

/** Si la pieza ya se pidió (en qué restauración) o sigue pendiente. */
function ItemState({ order }: { order: WhatsappQuoteItem["order"] }) {
  return order ? (
    <span className="text-sm">
      Pedida en{" "}
      <Link
        href={`/restauraciones/${order.restorationId}`}
        className="font-medium underline underline-offset-4"
      >
        {order.restorationCode}
      </Link>
    </span>
  ) : (
    <Badge variant="outline">Pendiente</Badge>
  );
}

/**
 * Importe cotizado (precio × cantidad); con varias unidades, el precio por unidad
 * debajo. Sin precio, "Por definir" (la pieza pasará a Consulta).
 */
function ItemPrice({
  cents,
  quantity,
}: {
  cents: number | null;
  quantity: number;
}) {
  if (cents === null)
    return (
      <span className="text-muted-foreground font-normal">Por definir</span>
    );
  return (
    <>
      {formatCents(lineCents(cents, quantity))}
      {quantity > 1 ? (
        <span className="text-muted-foreground block text-xs font-normal">
          {quantity} × {formatCents(cents)}
        </span>
      ) : null}
    </>
  );
}

/**
 * Piezas de la cotización de WhatsApp con el mismo aspecto que las de la guía: foto
 * "Antes", número, descripción, servicio y material, estado y precio. Tabla desde
 * `md`; tarjetas en el celular.
 */
export function QuoteItemsTable({
  quoteCode,
  items,
  photos,
  serviceNames,
  totalCents,
}: {
  quoteCode: string;
  items: WhatsappQuoteItem[];
  /** Primera foto "Antes" de cada pieza cotizada, por id. */
  photos: Record<string, string>;
  /** Nombres de los servicios del catálogo, por id. */
  serviceNames: Map<string, string>;
  totalCents: number;
}) {
  const head = "px-3 py-2 text-left font-medium whitespace-nowrap";
  const labeled = cn(RT.cell, RT.labeled);
  return (
    <div className={RT.wrapper}>
      <table className={RT.table}>
        <thead className={RT.thead}>
          <tr>
            <th scope="col" className={cn(head, "w-16")}>
              <span className="sr-only">Foto</span>
            </th>
            <th scope="col" className={head}>
              Pieza
            </th>
            <th scope="col" className={head}>
              Descripción
            </th>
            <th scope="col" className={head}>
              Servicio
            </th>
            <th scope="col" className={head}>
              Material
            </th>
            <th scope="col" className={head}>
              Estado
            </th>
            <th scope="col" className={cn(head, "text-right")}>
              Precio
            </th>
          </tr>
        </thead>
        <tbody className={RT.tbody}>
          {items.map((item) => {
            const services = item.serviceIds.flatMap(
              (id) => serviceNames.get(id) ?? [],
            );
            const code = `${quoteCode}-${item.number}`;
            return (
              <tr
                key={item.id}
                className={cn(RT.row, RT.hoverRow, PIECE_ACCENT_CLASS)}
                data-testid={`item-${item.number}`}
              >
                <td className={RT.cell}>
                  <PiecePhoto
                    code={code}
                    url={photos[item.id] ?? null}
                    size="sm"
                  />
                </td>
                <td className={cn(RT.cell, "max-md:min-w-0 max-md:flex-1")}>
                  <span className="text-heading inline-flex items-center gap-1 font-medium whitespace-nowrap">
                    <Gem aria-hidden className="text-primary size-3.5" />
                    Pieza {item.number}
                    {item.quantity > 1 ? (
                      <PieceQuantity quantity={item.quantity} />
                    ) : null}
                  </span>
                </td>
                <td className={cn(RT.cell, RT.full, "max-w-80 min-w-48")}>
                  <p className="break-words">{item.description}</p>
                  {item.notes ? (
                    <p className="text-muted-foreground mt-0.5 text-xs break-words whitespace-pre-line">
                      {item.notes}
                    </p>
                  ) : null}
                </td>
                <td className={labeled} data-label="Servicio">
                  {services.length > 0
                    ? services.join(", ")
                    : item.serviceName || "—"}
                </td>
                <td className={labeled} data-label="Material">
                  {materialSummary(item)}
                </td>
                <td className={labeled} data-label="Estado">
                  <ItemState order={item.order} />
                </td>
                <td
                  className={cn(
                    labeled,
                    "font-medium tabular-nums md:text-right",
                  )}
                  data-label="Precio"
                >
                  <ItemPrice cents={item.priceCents} quantity={item.quantity} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t max-md:block">
          <tr className="max-md:flex max-md:justify-between max-md:p-3">
            <td
              colSpan={6}
              className="px-3 py-2 text-right font-medium max-md:p-0"
            >
              Total
            </td>
            <td
              className="px-3 py-2 text-right font-medium tabular-nums max-md:p-0"
              data-testid="total-cotizacion"
            >
              {formatCents(totalCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
