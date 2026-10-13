import { ImageOff } from "lucide-react";

/** Miniatura de la primera foto "Antes" de la pieza (o un hueco si no tiene). */
export function PiecePhoto({
  code,
  url,
}: {
  code: string;
  url: string | null;
}) {
  if (!url) {
    return (
      <span
        className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-md"
        title="Sin foto de antes"
      >
        <ImageOff className="size-5" aria-hidden />
        <span className="sr-only">Sin foto de antes</span>
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block size-14 overflow-hidden rounded-md border"
    >
      {/* URL firmada de corta duración: no pasa por el optimizador de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Foto de antes de ${code}`}
        className="size-full object-cover"
        loading="lazy"
      />
    </a>
  );
}

/** Material, medida y peso en una sola celda ("—" si no hay nada). */
export function materialSummary(piece: {
  materialName: string;
  measure: string;
  weightGrams: number | null;
}): string {
  return (
    [
      piece.materialName,
      piece.measure,
      piece.weightGrams === null
        ? ""
        : `${piece.weightGrams.toLocaleString("es-PE")} g`,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}
