import type { FileOwner } from "@/domain/files";
import { cn } from "@/lib/utils";
import type { RestorationFile } from "@/server/files/queries";

import { FileGallery } from "./file-gallery";
import { FileUploader } from "./file-uploader";
import type { FileTarget } from "./types";

/**
 * Subida y galería juntas: en pantallas anchas el formulario va a la izquierda y las
 * fotos al lado (no debajo), así lo recién subido se ve sin bajar. Desde `wide` el
 * panel está en la columna derecha del detalle de la guía: el formulario va arriba
 * (sin formar una tercera columna) y la galería debajo, con todo el ancho.
 */
export function FilesPanel({
  owner,
  files,
  targets,
  canUpload,
  currentUserId,
  isAdmin,
  emptyText,
  showTargetLabels,
  stacked = false,
  className,
}: {
  owner: FileOwner;
  files: RestorationFile[];
  targets: FileTarget[];
  canUpload: boolean;
  currentUserId: string;
  isAdmin: boolean;
  emptyText?: string;
  /** Con un solo destino (la ficha de la pieza) el título de la galería sobra. */
  showTargetLabels?: boolean;
  /**
   * En una columna (ficha de la pieza): primero las fotos, que llenan el ancho de cada
   * columna, y debajo el formulario compacto, sin ponerlos lado a lado.
   */
  stacked?: boolean;
  className?: string;
}) {
  const gallery = (
    <FileGallery
      files={files}
      targets={targets}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      emptyText={emptyText}
      showTargetLabels={showTargetLabels}
      fill={stacked}
      className="min-w-0"
    />
  );
  if (!canUpload) return <div className={className}>{gallery}</div>;
  if (stacked) {
    return (
      <div className={cn("space-y-4", className)}>
        {gallery}
        <FileUploader owner={owner} targets={targets} />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "wide:grid-cols-1 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]",
        className,
      )}
    >
      <FileUploader
        owner={owner}
        targets={targets}
        className="wide:static wide:max-w-xl lg:sticky lg:top-4"
      />
      {gallery}
    </div>
  );
}
