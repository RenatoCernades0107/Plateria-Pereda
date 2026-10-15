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
  restorationId,
  files,
  targets,
  canUpload,
  currentUserId,
  isAdmin,
  emptyText,
  className,
}: {
  restorationId: string;
  files: RestorationFile[];
  targets: FileTarget[];
  canUpload: boolean;
  currentUserId: string;
  isAdmin: boolean;
  emptyText?: string;
  className?: string;
}) {
  const gallery = (
    <FileGallery
      files={files}
      targets={targets}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      emptyText={emptyText}
      className="min-w-0"
    />
  );
  if (!canUpload) return <div className={className}>{gallery}</div>;
  return (
    <div
      className={cn(
        "wide:grid-cols-1 grid items-start gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]",
        className,
      )}
    >
      <FileUploader
        restorationId={restorationId}
        targets={targets}
        className="wide:static wide:max-w-xl lg:sticky lg:top-4"
      />
      {gallery}
    </div>
  );
}
