"use client";

import { Columns2, Download, FileText, ImageIcon, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
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
  FILE_CATEGORY_LABELS,
  formatFileSize,
  groupByCategory,
} from "@/domain/files";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteRestorationFile } from "@/server/files/actions";
import type { RestorationFile } from "@/server/files/queries";

import type { FileTarget } from "./types";

/** Los navegadores (salvo Safari) no muestran HEIC: se ve como archivo para descargar. */
const VIEWABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const viewable = (f: RestorationFile) => VIEWABLE.has(f.mimeType) && !!f.url;

function Thumbnail({
  file,
  className,
}: {
  file: RestorationFile;
  className?: string;
}) {
  if (viewable(file))
    return (
      // Las fotos vienen de Storage con URL firmada; next/image necesitaría su dominio.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.url!}
        alt={file.name}
        loading="lazy"
        className={cn("bg-muted size-full object-cover", className)}
      />
    );
  const Icon = file.mimeType === "application/pdf" ? FileText : ImageIcon;
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs",
        className,
      )}
    >
      <Icon className="size-8" aria-hidden />
      <span className="line-clamp-2 break-all">{file.name}</span>
    </span>
  );
}

/** Antes y después lado a lado (P32), eligiendo cuál foto de cada grupo. */
function Comparison({
  title,
  before,
  after,
  onClose,
}: {
  title: string;
  before: RestorationFile[];
  after: RestorationFile[];
  onClose: () => void;
}) {
  const [b, setB] = useState(0);
  const [a, setA] = useState(after.length - 1);
  const column = (
    label: string,
    files: RestorationFile[],
    index: number,
    select: (i: number) => void,
  ) => (
    <figure className="min-w-0 space-y-2">
      <figcaption className="font-medium">{label}</figcaption>
      <div className="aspect-square overflow-hidden rounded-md border">
        <Thumbnail file={files[index]!} className="object-contain" />
      </div>
      {files.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-label={`${label}: ${f.name}`}
              aria-pressed={i === index}
              onClick={() => select(i)}
              className={cn(
                "size-12 overflow-hidden rounded border",
                i === index && "ring-primary ring-2",
              )}
            >
              <Thumbnail file={f} />
            </button>
          ))}
        </div>
      ) : null}
    </figure>
  );
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Antes y después · {title}</DialogTitle>
          <DialogDescription>
            Compara cómo llegó y cómo quedó.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {column("Antes", before, b, setB)}
          {column("Después", after, a, setA)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Viewer({
  file,
  canDelete,
  onClose,
}: {
  file: RestorationFile;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteRestorationFile(file.id);
      if ("error" in result) return setError(result.error);
      toast.success("Archivo borrado.");
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-all">{file.name}</DialogTitle>
          <DialogDescription>
            {FILE_CATEGORY_LABELS[file.category]} ·{" "}
            {formatFileSize(file.sizeBytes)} · Subido
            {file.createdByName ? ` por ${file.createdByName}` : ""} el{" "}
            {formatDateTime(file.createdAt)}
          </DialogDescription>
        </DialogHeader>
        {viewable(file) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.url!}
            alt={file.name}
            className="max-h-[70vh] w-full rounded-md object-contain"
          />
        ) : (
          <div className="h-48 overflow-hidden rounded-md border">
            <Thumbnail file={file} />
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          {canDelete ? (
            confirming ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={remove}
              >
                <Trash2 />
                {pending ? "Borrando…" : "Confirmar: borrar"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(true)}
              >
                <Trash2 />
                Borrar
              </Button>
            )
          ) : null}
          {file.mimeType === "application/pdf" && file.url ? (
            <Button asChild variant="outline">
              <a href={file.url} target="_blank" rel="noreferrer">
                <FileText />
                Abrir
              </a>
            </Button>
          ) : null}
          {file.downloadUrl ? (
            <Button asChild>
              <a href={file.downloadUrl}>
                <Download />
                Descargar
              </a>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Galería de la restauración (Paso 10.2): por destino (general y cada pieza) y por
 * clasificación; visor, descarga, comparación antes/después y borrado (admin o quien
 * lo subió, P32).
 */
export function FileGallery({
  files,
  targets,
  currentUserId,
  isAdmin,
}: {
  files: RestorationFile[];
  targets: FileTarget[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [viewing, setViewing] = useState<RestorationFile | null>(null);
  const [comparing, setComparing] = useState<FileTarget | null>(null);

  const sections = targets
    .map((target) => ({
      target,
      files: files.filter((f) => f.pieceId === target.id),
    }))
    .filter((s) => s.files.length > 0);

  if (sections.length === 0)
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        Aún no hay fotos ni archivos.
      </p>
    );

  const comparable = (list: RestorationFile[]) => ({
    before: list.filter((f) => f.category === "antes" && viewable(f)),
    after: list.filter((f) => f.category === "despues" && viewable(f)),
  });

  return (
    <div className="space-y-6">
      {sections.map(({ target, files: list }) => {
        const pair = comparable(list);
        const headingId = `archivos-${target.id ?? "general"}`;
        return (
          <section
            key={target.id ?? "general"}
            aria-labelledby={headingId}
            className="space-y-3"
            data-testid={headingId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={headingId} className="font-semibold">
                {target.label}
              </h2>
              {pair.before.length > 0 && pair.after.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setComparing(target)}
                >
                  <Columns2 />
                  Comparar antes y después
                </Button>
              ) : null}
            </div>
            {groupByCategory(list).map((group) => (
              <div key={group.category} className="space-y-1.5">
                <h3 className="text-muted-foreground text-sm font-medium">
                  {FILE_CATEGORY_LABELS[group.category]} ({group.files.length})
                </h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {group.files.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        aria-label={`Ver ${f.name}`}
                        onClick={() => setViewing(f)}
                        className="focus-visible:ring-ring block aspect-square w-full overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <Thumbnail file={f} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      {viewing ? (
        <Viewer
          key={viewing.id}
          file={viewing}
          canDelete={isAdmin || viewing.createdBy === currentUserId}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {comparing ? (
        <Comparison
          title={comparing.label}
          {...comparable(files.filter((f) => f.pieceId === comparing.id))}
          onClose={() => setComparing(null)}
        />
      ) : null}
    </div>
  );
}
