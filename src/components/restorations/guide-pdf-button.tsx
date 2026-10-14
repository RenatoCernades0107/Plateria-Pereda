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
  type GuidePdfModel,
} from "@/domain/guide-pdf";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";

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
      const images =
        hasPhotos && withPhotos
          ? await loadPhotos(
              data.pieces.filter((p) => selected.has(p.id)),
              photos,
            )
          : null;
      await drawGuidePdf(model, images, guidePdfFileName(data.code));
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

/** Dibuja la guía en un A4 vertical (mm) y lo descarga. */
async function drawGuidePdf(
  model: GuidePdfModel,
  images: Map<string, string> | null,
  fileName: string,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const lineH = 4.2;
  const pad = 2;
  const photoSize = 18;
  let y = margin;

  // Encabezado de la guía.
  pdf.setFont("helvetica", "bold").setFontSize(16);
  pdf.text(model.title, margin, y + 4);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  pdf.text(model.subtitle, margin, y + 9);
  pdf.setTextColor(0);
  y += 15;

  pdf.setFontSize(9);
  const half = (pageW - margin * 2) / 2;
  model.info.forEach(([label, value], i) => {
    const x = margin + (i % 2) * half;
    if (i > 0 && i % 2 === 0) y += 5;
    pdf.setFont("helvetica", "bold").text(`${label}:`, x, y);
    const labelW = pdf.getTextWidth(`${label}: `) + 1;
    pdf.setFont("helvetica", "normal");
    pdf.text(
      pdf.splitTextToSize(value, half - labelW - 3)[0] ?? "",
      x + labelW,
      y,
    );
  });
  y += 8;

  // Tabla de piezas.
  type Column = { key: string; title: string; width: number };
  const columns: Column[] = [
    ...(images
      ? [{ key: "photo", title: "Foto", width: photoSize + pad * 2 }]
      : []),
    { key: "code", title: "Pieza", width: 28 },
    { key: "description", title: "Descripción", width: 0 },
    { key: "status", title: "Estado", width: 30 },
    ...(model.showPrice ? [{ key: "price", title: "Precio", width: 26 }] : []),
  ];
  const fixed = columns.reduce((sum, c) => sum + c.width, 0);
  columns.find((c) => c.key === "description")!.width =
    pageW - margin * 2 - fixed;

  const drawHeader = () => {
    pdf.setFillColor(238, 238, 238);
    pdf.rect(margin, y, pageW - margin * 2, 7, "F");
    pdf.setFont("helvetica", "bold").setFontSize(9);
    let x = margin;
    for (const c of columns) {
      const right = c.key === "price";
      pdf.text(c.title, right ? x + c.width - pad : x + pad, y + 4.8, {
        align: right ? "right" : "left",
      });
      x += c.width;
    }
    y += 7;
  };
  drawHeader();

  model.rows.forEach((row, index) => {
    const textW = (key: string) =>
      columns.find((c) => c.key === key)!.width - pad * 2;
    pdf.setFontSize(9);
    const description = pdf.splitTextToSize(
      row.description,
      textW("description"),
    );
    pdf.setFontSize(8);
    const detail = row.detail
      ? pdf.splitTextToSize(row.detail, textW("description"))
      : [];
    const notes = row.notes
      ? pdf.splitTextToSize(`Nota: ${row.notes}`, textW("description"))
      : [];
    const status = pdf.splitTextToSize(row.status, textW("status"));
    const textLines = Math.max(
      description.length + detail.length + notes.length,
      status.length,
    );
    const rowH = Math.max(
      textLines * lineH + pad * 2,
      images ? photoSize + pad * 2 : 0,
    );
    if (y + rowH > pageH - margin - 6) {
      pdf.addPage();
      y = margin;
      drawHeader();
    }
    if (index % 2 === 1) {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, y, pageW - margin * 2, rowH, "F");
    }
    const top = y + pad + 3;
    let x = margin;
    for (const c of columns) {
      if (c.key === "photo") {
        const image = images?.get(row.id);
        if (image) {
          pdf.addImage(image, "JPEG", x + pad, y + pad, photoSize, photoSize);
        } else {
          pdf.setFont("helvetica", "italic").setFontSize(7).setTextColor(140);
          pdf.text("Sin foto", x + pad, top);
          pdf.setTextColor(0);
        }
      } else if (c.key === "code") {
        pdf.setFont("helvetica", "bold").setFontSize(9);
        pdf.text(row.code, x + pad, top);
      } else if (c.key === "description") {
        let ty = top;
        pdf.setFont("helvetica", "normal").setFontSize(9);
        pdf.text(description, x + pad, ty);
        ty += description.length * lineH;
        pdf.setFontSize(8).setTextColor(100);
        if (detail.length) {
          pdf.text(detail, x + pad, ty);
          ty += detail.length * lineH;
        }
        if (notes.length) {
          pdf.setFont("helvetica", "italic").text(notes, x + pad, ty);
        }
        pdf.setTextColor(0);
      } else if (c.key === "status") {
        pdf.setFont("helvetica", "normal").setFontSize(8.5);
        pdf.text(status, x + pad, top);
      } else if (c.key === "price") {
        pdf.setFont("helvetica", "normal").setFontSize(9);
        pdf.text(row.price ?? "", x + c.width - pad, top, { align: "right" });
      }
      x += c.width;
    }
    y += rowH;
    pdf.setDrawColor(220);
    pdf.line(margin, y, pageW - margin, y);
  });
  // Totales (solo con montos).
  if (model.totals.length) {
    const needed = model.totals.length * 5 + 6;
    if (y + needed > pageH - margin - 6) {
      pdf.addPage();
      y = margin;
    }
    y += 6;
    pdf.setFontSize(9);
    for (const [label, value] of model.totals) {
      const strong = label === "Total" || label === "Saldo";
      pdf.setFont("helvetica", strong ? "bold" : "normal");
      if (label) {
        pdf.text(label, pageW - margin - 40, y, { align: "right" });
        pdf.text(value, pageW - margin - pad, y, { align: "right" });
      } else {
        pdf.setFont("helvetica", "italic").setTextColor(110);
        pdf.text(value, pageW - margin - pad, y, { align: "right" });
        pdf.setTextColor(0);
      }
      y += 5;
    }
  }

  // Notas generales.
  if (model.notes) {
    pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(model.notes, pageW - margin * 2);
    if (y + lines.length * lineH + 10 > pageH - margin - 6) {
      pdf.addPage();
      y = margin;
    }
    y += 6;
    pdf.setFont("helvetica", "bold").text("Notas generales", margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal").text(lines, margin, y);
  }

  // Pie de página: número de página.
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(140);
    pdf.text(`Página ${page} de ${pages}`, pageW - margin, pageH - 8, {
      align: "right",
    });
    pdf.text(model.title, margin, pageH - 8);
  }
  pdf.save(fileName);
}
