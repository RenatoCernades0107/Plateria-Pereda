"use client";

import { MoneyCell } from "@/components/money-cell";
import type { Cents } from "@/domain/money";
import { setPieceServiceCost } from "@/server/service-cost-actions";

/**
 * Costo de servicio de una pieza. Con `editable` (admin y logística) es un campo
 * que se guarda con el botón o con Enter; en pantalla de solo lectura, y al
 * imprimir, es solo el monto ("Por definir" si el taller aún no lo pasa).
 */
export function ServiceCostCell({
  pieceId,
  pieceCode,
  cents,
  editable,
}: {
  pieceId: string;
  pieceCode: string;
  cents: Cents | null;
  editable: boolean;
}) {
  return (
    <MoneyCell
      cents={cents}
      editable={editable}
      emptyText="Por definir"
      inputLabel={`Costo de servicio de ${pieceCode}`}
      saveLabel={`Guardar costo de ${pieceCode}`}
      savedMessage={`Costo de ${pieceCode} guardado.`}
      onSave={(value) => setPieceServiceCost(pieceId, value)}
    />
  );
}
