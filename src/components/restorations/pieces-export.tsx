"use client";

import { Download, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatCents } from "@/domain/money";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import type { BoardPiece } from "@/server/restorations/queries";

export type ExportFormat = "png" | "pdf";

/** Nombre del archivo exportado, p. ej. `piezas-2026-10-14.pdf`. */
export function exportFileName(format: ExportFormat, date = new Date()) {
  return `piezas-${date.toISOString().slice(0, 10)}.${format}`;
}

/** Fila de la hoja exportada (sin foto), con el precio solo si se puede ver. */
export function exportRow(piece: BoardPiece, showPrice: boolean) {
  return {
    code: piece.code,
    client: `${piece.restorationCode} · ${piece.clientName}`,
    description: piece.description,
    service: piece.serviceName || "—",
    status: PIECE_STATUS_LABELS[piece.status],
    workshop: piece.workshopName ?? "Sin taller",
    price: showPrice
      ? piece.priceCents === null
        ? "Por definir"
        : formatCents(piece.priceCents)
      : null,
  };
}

function download(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
}

/**
 * Exporta las piezas elegidas como imagen PNG o PDF: foto, código, cliente,
 * descripción, servicio, estado, taller y (si el rol lo ve) precio. Se dibuja una hoja
 * fuera de pantalla y se captura con html-to-image (jsPDF para el PDF).
 */
export function PiecesExportButtons({
  pieces,
  showPrice,
}: {
  pieces: BoardPiece[];
  showPrice: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    const node = sheet.current;
    if (!node || pieces.length === 0) return;
    setBusy(format);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      if (format === "png") {
        download(dataUrl, exportFileName("png"));
      } else {
        const { jsPDF } = await import("jspdf");
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const pdf = new jsPDF({
          orientation: width > height ? "landscape" : "portrait",
          unit: "px",
          format: [width, height],
        });
        pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
        pdf.save(exportFileName("pdf"));
      }
      toast.success(
        `${pieces.length === 1 ? "1 pieza exportada" : `${pieces.length} piezas exportadas`} (${format.toUpperCase()}).`,
      );
    } catch {
      toast.error(
        "No se pudo exportar. Revisa tu conexión (las fotos deben poder descargarse) e inténtalo de nuevo.",
      );
    } finally {
      setBusy(null);
    }
  };

  const cell = "border px-2 py-1 text-left align-top";
  return (
    <>
      {(["png", "pdf"] as const).map((format) => (
        <Button
          key={format}
          size="sm"
          variant="outline"
          disabled={busy !== null || pieces.length === 0}
          onClick={() => run(format)}
        >
          {busy === format ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          Exportar {format.toUpperCase()}
        </Button>
      ))}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 -left-[10000px]"
      >
        <div
          ref={sheet}
          className="w-[1000px] bg-white p-4 text-xs text-black"
          data-testid="hoja-exportar"
        >
          <p className="mb-2 text-sm font-semibold">Piezas ({pieces.length})</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cell}>Foto</th>
                <th className={cell}>Pieza</th>
                <th className={cell}>Guía · cliente</th>
                <th className={cell}>Descripción</th>
                <th className={cell}>Servicio</th>
                <th className={cell}>Estado</th>
                <th className={cell}>Taller</th>
                {showPrice ? <th className={cell}>Precio</th> : null}
              </tr>
            </thead>
            <tbody>
              {pieces.map((piece) => {
                const row = exportRow(piece, showPrice);
                return (
                  <tr key={piece.id}>
                    <td className={cell}>
                      {piece.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={piece.photoUrl}
                          alt=""
                          crossOrigin="anonymous"
                          className="size-16 object-cover"
                        />
                      ) : (
                        "Sin foto"
                      )}
                    </td>
                    <td className={cell}>{row.code}</td>
                    <td className={cell}>{row.client}</td>
                    <td className={cell}>{row.description}</td>
                    <td className={cell}>{row.service}</td>
                    <td className={cell}>{row.status}</td>
                    <td className={cell}>{row.workshop}</td>
                    {row.price !== null ? (
                      <td className={cell}>{row.price}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
