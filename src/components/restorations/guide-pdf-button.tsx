"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

/** Logo de Pereda (en `public/`) para el encabezado del PDF. */
const LOGO_URL = "/logo-pereda.png";

/**
 * Botón "Exportar PDF" del detalle de la guía. El diálogo deja elegir qué piezas van
 * en el PDF (por defecto, todas) y si se incluye la foto "Antes" de cada una.
 */
export function GuidePdfButton({
  data,
  photos = {},
}: {
  data: GuidePdfData;
  /** Primera foto "Antes" de cada pieza (por id). */
  photos?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const allIds = data.pieces.map((p) => p.id);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(allIds),
  );
  const hasPhotos = data.pieces.some((p) => photos[p.id]);
  const [withPhotos, setWithPhotos] = useState(true);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function exportPdf() {
    if (selected.size === 0) {
      toast.error("Elige al menos una pieza para exportar.");
      return;
    }
    setBusy(true);
    try {
      const model = guidePdfModel(data, selected);
      const [logo, images] = await Promise.all([
        // Sin el logo, el PDF sale igual.
        thumbnail(LOGO_URL, 400).catch(() => null),
        hasPhotos && withPhotos
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
          setOpen(true);
        }}
        disabled={data.pieces.length === 0}
      >
        <FileDown />
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
          <fieldset className="space-y-2">
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
                    <span className="font-medium">{p.code}</span>
                    <span className="truncate">{p.description}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
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
                checked={withPhotos}
                onChange={(e) => setWithPhotos(e.target.checked)}
              />
              Incluir la foto «Antes» de cada pieza
            </label>
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
              disabled={busy || selected.size === 0}
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

/** Miniaturas JPEG (máx. 240 px) de las fotos; las que no se puedan bajar se omiten. */
async function loadPhotos(
  pieces: readonly { id: string }[],
  photos: Record<string, string>,
): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  await Promise.all(
    pieces.map(async (p) => {
      const url = photos[p.id];
      if (!url) return;
      try {
        images.set(p.id, await thumbnail(url, 240));
      } catch {
        // Sin la foto, la pieza sale igual (con "Sin foto").
      }
    }),
  );
  return images;
}

async function thumbnail(url: string, max: number): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
