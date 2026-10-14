"use client";

import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  FileText,
  ImageIcon,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { useRouter } from "next/navigation";
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

/** Borra un archivo y refresca la página (la acción revalida la guía y la pieza). */
function useDeleteFile(file: RestorationFile, onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      const result = await deleteRestorationFile(file.id);
      if ("error" in result) return setError(result.error);
      toast.success("Archivo borrado.");
      onDone();
      router.refresh();
    });
  return { remove, pending, error };
}

/** Confirmación antes de borrar desde la miniatura. */
function DeleteDialog({
  file,
  onClose,
}: {
  file: RestorationFile;
  onClose: () => void;
}) {
  const { remove, pending, error } = useDeleteFile(file, onClose);
  return (
    <Dialog open onOpenChange={(open) => (open || pending ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-all">
            ¿Borrar «{file.name}»?
          </DialogTitle>
          <DialogDescription>
            Se borra para siempre. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {viewable(file) ? (
          <div className="mx-auto size-32 overflow-hidden rounded-md border">
            <Thumbnail file={file} />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={remove}
          >
            <Trash2 />
            {pending ? "Borrando…" : "Sí, borrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Visor ampliado (lightbox): la foto grande, con anterior/siguiente (botones y
 * flechas del teclado) entre los archivos del mismo destino, descarga y borrado.
 */
function Viewer({
  files,
  index,
  canDelete,
  onNavigate,
  onClose,
}: {
  files: RestorationFile[];
  index: number;
  canDelete: (file: RestorationFile) => boolean;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const file = files[index]!;
  const [confirming, setConfirming] = useState<string | null>(null);
  const { remove, pending, error } = useDeleteFile(file, onClose);
  const total = files.length;
  const go = (step: number) => {
    if (total < 2) return;
    onNavigate((index + step + total) % total);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        className="sm:max-w-4xl"
        data-testid="visor"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") go(-1);
          if (event.key === "ArrowRight") go(1);
        }}
      >
        <DialogHeader>
          <DialogTitle className="pr-6 break-all">{file.name}</DialogTitle>
          <DialogDescription>
            {total > 1 ? `${index + 1} de ${total} · ` : ""}
            {FILE_CATEGORY_LABELS[file.category]} ·{" "}
            {formatFileSize(file.sizeBytes)} · Subido
            {file.createdByName ? ` por ${file.createdByName}` : ""} el{" "}
            {formatDateTime(file.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          {viewable(file) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url!}
              alt={file.name}
              className="bg-muted/40 max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : (
            <div className="h-48 overflow-hidden rounded-md border">
              <Thumbnail file={file} />
            </div>
          )}
          {total > 1 ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Anterior"
                className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow"
                onClick={() => go(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Siguiente"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow"
                onClick={() => go(1)}
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          {canDelete(file) ? (
            confirming === file.id ? (
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
                onClick={() => setConfirming(file.id)}
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

/** Miniatura que abre el visor, con su botón de borrar (si se puede). */
function GalleryItem({
  file,
  canDelete,
  onOpen,
  onDelete,
}: {
  file: RestorationFile;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const image = viewable(file);
  return (
    <li className="group relative" data-testid="miniatura">
      <button
        type="button"
        aria-label={`Ver ${file.name}`}
        title={image ? "Ver en grande" : "Ver archivo"}
        onClick={onOpen}
        className={cn(
          "focus-visible:ring-ring relative block aspect-square w-full overflow-hidden rounded-md border transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:outline-none",
          image ? "cursor-zoom-in" : "cursor-pointer",
        )}
      >
        <Thumbnail
          file={file}
          className={cn(
            image && "transition-transform duration-200 group-hover:scale-105",
          )}
        />
        {image ? (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
          >
            <ZoomIn className="size-6 drop-shadow" />
          </span>
        ) : null}
      </button>
      {canDelete ? (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          aria-label={`Borrar ${file.name}`}
          title="Borrar"
          onClick={onDelete}
          className="absolute top-1 right-1 size-7 rounded-full shadow transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Galería de la restauración (Paso 10.2): por destino (general y cada pieza) y por
 * clasificación; visor ampliado con anterior/siguiente, descarga, comparación
 * antes/después y borrado con confirmación (admin o quien lo subió, P32).
 */
export function FileGallery({
  files,
  targets,
  currentUserId,
  isAdmin,
  emptyText = "Aún no hay fotos ni archivos.",
  className,
}: {
  files: RestorationFile[];
  targets: FileTarget[];
  currentUserId: string;
  isAdmin: boolean;
  emptyText?: string;
  className?: string;
}) {
  const [viewing, setViewing] = useState<{
    target: string | null;
    id: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<RestorationFile | null>(null);
  const [comparing, setComparing] = useState<FileTarget | null>(null);
  const canDelete = (f: RestorationFile) =>
    isAdmin || f.createdBy === currentUserId;

  // Cada destino con sus archivos en el orden en que se ven (por clasificación).
  const sections = targets
    .map((target) => {
      const groups = groupByCategory(
        files.filter((f) => f.pieceId === target.id),
      );
      return { target, groups, ordered: groups.flatMap((g) => g.files) };
    })
    .filter((s) => s.ordered.length > 0);

  if (sections.length === 0)
    return (
      <p
        className={cn(
          "text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm",
          className,
        )}
      >
        {emptyText}
      </p>
    );

  const comparable = (list: RestorationFile[]) => ({
    before: list.filter((f) => f.category === "antes" && viewable(f)),
    after: list.filter((f) => f.category === "despues" && viewable(f)),
  });

  const viewList = viewing
    ? (sections.find((s) => s.target.id === viewing.target)?.ordered ?? [])
    : [];
  const viewIndex = viewing
    ? viewList.findIndex((f) => f.id === viewing.id)
    : -1;

  return (
    <div className={cn("space-y-5", className)}>
      {sections.map(({ target, groups, ordered }) => {
        const pair = comparable(ordered);
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
            {groups.map((group) => (
              <div key={group.category} className="space-y-1.5">
                <h3 className="text-muted-foreground text-sm font-medium">
                  {FILE_CATEGORY_LABELS[group.category]} ({group.files.length})
                </h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                  {group.files.map((f) => (
                    <GalleryItem
                      key={f.id}
                      file={f}
                      canDelete={canDelete(f)}
                      onOpen={() => setViewing({ target: target.id, id: f.id })}
                      onDelete={() => setDeleting(f)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      {viewing && viewIndex >= 0 ? (
        <Viewer
          files={viewList}
          index={viewIndex}
          canDelete={canDelete}
          onNavigate={(i) =>
            setViewing({ target: viewing.target, id: viewList[i]!.id })
          }
          onClose={() => setViewing(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          key={deleting.id}
          file={deleting}
          onClose={() => setDeleting(null)}
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
