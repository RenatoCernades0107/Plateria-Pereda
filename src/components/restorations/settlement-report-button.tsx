"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import type { PieceBoardFilters } from "@/domain/piece-board-filters";
import {
  settlementReportFileName,
  settlementReportModel,
} from "@/domain/settlement-report";
import type { BoardPiece } from "@/server/restorations/queries";
import { getProviderReportData } from "@/server/restorations/report-actions";

import { PDF_LOGO_URL, thumbnail } from "./pdf-images";
import { drawSettlementReport } from "./settlement-report-draw";

/**
 * Botón "Liquidación por proveedor" de la vista de piezas: un PDF con el proveedor y el
 * costo de servicio de cada pieza elegida, el filtro de fecha aplicado y el total, para
 * calcular el pago al proveedor. Solo para quien ve el costo de servicio.
 */
export function SettlementReportButton({
  pieces,
  filters,
}: {
  pieces: BoardPiece[];
  filters?: PieceBoardFilters;
}) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (pieces.length === 0) return;
    setBusy(true);
    try {
      const [data, logo] = await Promise.all([
        getProviderReportData(pieces.map((p) => p.id)),
        thumbnail(PDF_LOGO_URL, 400).catch(() => null),
      ]);
      if ("error" in data) {
        toast.error(data.error);
        return;
      }
      const model = settlementReportModel(
        pieces.map((p) => ({
          id: p.id,
          code: p.code,
          quantity: p.quantity,
          status: p.status,
          description: p.description,
          serviceName: p.serviceName,
          workshopName: p.workshopName,
          serviceCostCents: p.serviceCostCents,
        })),
        {
          generatedBy: data.generatedBy,
          dateFilter: filters
            ? {
                from: filters.from,
                to: filters.to,
                dateField: filters.dateField,
              }
            : null,
        },
      );
      const pdf = await drawSettlementReport(model, { logo });
      pdf.save(settlementReportFileName());
      toast.success(
        pieces.length === 1
          ? "Liquidación generada (1 pieza)."
          : `Liquidación generada (${pieces.length} piezas).`,
      );
    } catch {
      toast.error("No se pudo generar el reporte. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy || pieces.length === 0}
      onClick={generate}
    >
      {busy ? (
        <Loader2 className="animate-spin" />
      ) : (
        <FileDown className={PDF_ICON_CLASS} />
      )}
      Liquidación de servicios por proveedor
    </Button>
  );
}
