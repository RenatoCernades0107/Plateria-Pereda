"use client";

import { FileDown, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  guidePdfFileName,
  guidePdfModel,
  type GuidePdfData,
} from "@/domain/guide-pdf";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";

import { drawGuidePdf } from "./guide-pdf-draw";
import { loadPhotos, PDF_LOGO_URL, thumbnail } from "./pdf-images";

/**
 * Botón "Exportar PDF" del detalle de la guía. El diálogo deja elegir qué piezas van
 * en el PDF (por defecto, todas) y si se incluye la foto "Antes" de cada una. Sin el
 * teléfono del cliente no se genera el PDF: el diálogo avisa y lleva a actualizarlo.
 */
export function GuidePdfButton({
  data,
  photos = {},
  clientId = null,
}: {
  data: GuidePdfData;
  /** Primera foto "Antes" de cada pieza (por id). */
  photos?: Record<string, string>;
  /** Cliente de la guía, para llevar a actualizar su teléfono. */
  clientId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const allIds = data.pieces.map((p) => p.id);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(allIds),
  );
  const hasPhotos = data.pieces.some((p) => photos[p.id]);
  const [withPhotos, setWithPhotos] = useState(true);
  // Versión para el taller: sin cliente ni precios, con la foto de cada pieza.
  const [forWorkshop, setForWorkshop] = useState(false);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const missingPhone = !data.phone;

  async function exportPdf() {
    if (missingPhone) return;
    if (selected.size === 0) {
      toast.error("Elige al menos una pieza para exportar.");
      return;
    }
    setBusy(true);
    try {
      const model = guidePdfModel(data, selected, { forWorkshop });
      const [logo, images] = await Promise.all([
        // Sin el logo, el PDF sale igual.
        thumbnail(PDF_LOGO_URL, 400).catch(() => null),
        hasPhotos && (withPhotos || forWorkshop)
          ? loadPhotos(
              data.pieces.filter((p) => selected.has(p.id)),
              photos,
            )
          : null,
      ]);
      const pdf = await drawGuidePdf(model, { logo, images });
      pdf.save(guidePdfFileName(data.code));
      toast.success(
        `Guía exportada en PDF (${selected.size === 1 ? "1 pieza" : `${selected.size} piezas`}).`,
      );
      setOpen(false);
    } catch {
      toast.error("No se pudo exportar el PDF. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const allSelected = selected.size === allIds.length;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          // Cada vez que se abre, todas las piezas vuelven a estar elegidas.
          setSelected(new Set(allIds));
          setForWorkshop(false);
          setOpen(true);
        }}
        disabled={data.pieces.length === 0}
      >
        <FileDown className={PDF_ICON_CLASS} />
        Exportar PDF
      </Button>
      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar guía en PDF</DialogTitle>
            <DialogDescription>
              Elige las piezas que van en el PDF de {data.code}.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-muted-foreground text-xs font-medium">
                Piezas en el PDF ({selected.size}/{allIds.length})
              </legend>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(allIds))
                }
              >
                {allSelected ? "Quitar todas" : "Elegir todas"}
              </Button>
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {data.pieces.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary size-4 shrink-0"
                      checked={selected.has(p.id)}
                      onChange={(e) => toggle(p.id, e.target.checked)}
                    />
                    <span className="font-medium whitespace-nowrap">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.description}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {PIECE_STATUS_LABELS[p.status]}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {hasPhotos ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={withPhotos || forWorkshop}
                disabled={forWorkshop}
                onChange={(e) => setWithPhotos(e.target.checked)}
              />
              Incluir la foto «Antes» de cada pieza
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 size-4"
              checked={forWorkshop}
              onChange={(e) => setForWorkshop(e.target.checked)}
            />
            <span>
              Para taller
              <span className="text-muted-foreground block text-xs">
                Sin datos del cliente ni precios de venta, con la foto de cada
                pieza.
              </span>
            </span>
          </label>
          {missingPhone ? (
            <Notice tone="destructive" className="space-y-2">
              <p className="flex items-start gap-2 font-medium">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Esta guía no tiene el teléfono del cliente. Para generar el PDF
                es obligatorio.
              </p>
              {clientId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/clientes/${clientId}`}>
                    Actualizar teléfono del cliente
                  </Link>
                </Button>
              ) : null}
            </Notice>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={exportPdf}
              disabled={busy || selected.size === 0 || missingPhone}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
