"use client";

import { useState } from "react";

import { MoneyCell } from "@/components/money-cell";
import { formatCents, parseMoney, type Cents } from "@/domain/money";
import { setPieceSalePrice } from "@/server/sale-price-actions";
import { setPieceServiceCost } from "@/server/service-cost-actions";

import { PriceChangeDialog } from "./price-change-dialog";

type MoneyPiece = { id: string; code: string; restorationId: string };

/** Costo de servicio editable (admin y logística, P55). */
export function ServiceCostInput({
  piece,
  cents,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
}) {
  return (
    <MoneyCell
      cents={cents}
      editable
      emptyText="Por definir"
      inputLabel={`Costo de servicio de ${piece.code}`}
      saveLabel={`Guardar costo de ${piece.code}`}
      savedMessage={`Costo de ${piece.code} guardado.`}
      onSave={(value) => setPieceServiceCost(piece.id, value)}
    />
  );
}

/**
 * Precio de venta: el admin lo ingresa (D58); con la orden de Shopify creada un precio
 * ya asignado se cambia con motivo ("Cambiar precio", P12). Ventas solo lo ve.
 */
export function SalePriceInput({
  piece,
  cents,
  hasOrder,
  editable,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  hasOrder: boolean;
  editable: boolean;
}) {
  if (editable && hasOrder && cents !== null) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="tabular-nums">{formatCents(cents)}</span>
        <PriceChangeDialog
          restorationId={piece.restorationId}
          piece={{ id: piece.id, code: piece.code, priceCents: cents }}
        />
      </div>
    );
  }
  return (
    <MoneyCell
      cents={cents}
      editable={editable}
      emptyText="Sin asignar"
      inputLabel={`Precio de venta de ${piece.code}`}
      saveLabel={`Guardar precio de ${piece.code}`}
      savedMessage={`Precio de ${piece.code} guardado.`}
      onSave={(value) => setPieceSalePrice(piece.id, value)}
    />
  );
}

/**
 * Precio de venta en la tabla de piezas: texto de solo lectura salvo en el modo
 * «Editar precios» (solo admin), donde todas las filas muestran el campo. Si la orden
 * de Shopify ya está creada, guardar abre el cambio de precio con motivo (P12).
 */
export function BoardSalePriceCell({
  piece,
  cents,
  hasOrder,
  editing,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  hasOrder: boolean;
  editing: boolean;
}) {
  const [proposed, setProposed] = useState<Cents | null>(null);
  const withReason = hasOrder && cents !== null;
  return (
    <>
      <MoneyCell
        // Al entrar o salir del modo edición el campo vuelve al precio guardado.
        key={`${editing}-${cents}`}
        cents={cents}
        editable={editing}
        emptyText="Sin asignar"
        inputLabel={`Precio de venta de ${piece.code}`}
        saveLabel={`Guardar precio de ${piece.code}`}
        savedMessage={`Precio de ${piece.code} guardado.`}
        onSave={async (value) => {
          if (!withReason) return setPieceSalePrice(piece.id, value);
          const next = parseMoney(value.trim());
          if (next === null) {
            return { error: "Ingresa un monto válido (hasta 2 decimales)." };
          }
          setProposed(next);
          return { pending: true };
        }}
      />
      {withReason && proposed !== null ? (
        <PriceChangeDialog
          key={proposed}
          restorationId={piece.restorationId}
          piece={{ id: piece.id, code: piece.code, priceCents: cents }}
          proposedCents={proposed}
          open
          onOpenChange={(open) => !open && setProposed(null)}
        />
      ) : null}
    </>
  );
}
