"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import {
  providerReportFileName,
  providerReportModel,
} from "@/domain/provider-report";
import type { BoardPiece } from "@/server/restorations/queries";
import { getProviderReportData } from "@/server/restorations/report-actions";

import { drawProviderReport } from "./provider-report-draw";
import { loadPhotos, PDF_LOGO_URL, thumbnail } from "./pdf-images";

/**
 * Botón "Generar reporte para proveedor" de la vista de piezas: un PDF con la ficha de
 * cada pieza elegida (sin precios, costos ni datos del cliente) y la fecha de impresión.
 */
export function ProviderReportButton({ pieces }: { pieces: BoardPiece[] }) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (pieces.length === 0) return;
    setBusy(true);
    try {
      const [data, logo, images] = await Promise.all([
        getProviderReportData(pieces.map((p) => p.id)),
        // Sin el logo ni las fotos, el reporte sale igual.
        thumbnail(PDF_LOGO_URL, 400).catch(() => null),
        loadPhotos(
          pieces,
          Object.fromEntries(
            pieces.flatMap((p) => (p.photoUrl ? [[p.id, p.photoUrl]] : [])),
          ),
        ),
      ]);
      if ("error" in data) {
        toast.error(data.error);
        return;
      }
      const model = providerReportModel(
        pieces.map((p) => ({
          id: p.id,
          guideCode: p.restorationCode,
          code: p.code,
          status: p.status,
          description: p.description,
          notes: data.notes[p.id] ?? "",
          serviceName: p.serviceName,
          materialName: p.materialName,
          measure: p.measure,
          weightGrams: p.weightGrams,
        })),
        { generatedBy: data.generatedBy },
      );
      const pdf = await drawProviderReport(model, { logo, images });
      pdf.save(providerReportFileName());
      toast.success(
        pieces.length === 1
          ? "Reporte generado (1 pieza)."
          : `Reporte generado (${pieces.length} piezas).`,
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
      Generar reporte para proveedor
    </Button>
  );
}
