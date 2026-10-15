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
import {
  type KeyboardEvent,
  type TouchEvent,
  useRef,
  useState,
  useTransition,
} from "react";
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
  type FileCategory,
  formatFileSize,
  groupByCategory,
} from "@/domain/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteRestorationFile } from "@/server/files/actions";
import type { RestorationFile } from "@/server/files/queries";

import type { FileTarget } from "./types";

/** Los navegadores (salvo Safari) no muestran HEIC: se ve como archivo para descargar. */
const VIEWABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const viewable = (f: RestorationFile) => VIEWABLE.has(f.mimeType) && !!f.url;

/** Qué recorre el visor: las fotos del destino o sus demás archivos (PDF, HEIC). */
type ViewKind = "images" | "others";

/** Distancia horizontal mínima (px) para que deslizar cambie de foto. */
const SWIPE_PX = 40;

/** Flechas ← → del teclado y deslizar con el dedo para pasar de foto. */
function useStepper(onPrev?: () => void, onNext?: () => void) {
  const touchX = useRef<number | null>(null);
  return {
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    },
    onTouchStart: (e: TouchEvent) => {
      touchX.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const start = touchX.current;
      touchX.current = null;
      const end = e.changedTouches[0]?.clientX;
      if (start === null || end === undefined) return;
      if (end - start > SWIPE_PX) onPrev?.();
      else if (start - end > SWIPE_PX) onNext?.();
    },
  };
}

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
        draggable={false}
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
      <div className="bg-muted/60 aspect-square overflow-hidden rounded-md border">
        <Thumbnail
          file={files[index]!}
          className="bg-transparent object-contain"
        />
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
                "size-12 overflow-hidden rounded-md border-2 border-transparent",
                i === index && "border-primary",
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

/** Confirmación antes de borrar desde la galería. */
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
 * Visor ampliado (lightbox): la foto grande, con anterior/siguiente (botones,
 * flechas del teclado y deslizar) entre las fotos del mismo destino, descarga y borrado.
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
  const stepper = useStepper(
    () => go(-1),
    () => go(1),
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        className="sm:max-w-4xl"
        data-testid="visor"
        onKeyDown={stepper.onKeyDown}
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
        <div
          className="relative"
          onTouchStart={stepper.onTouchStart}
          onTouchEnd={stepper.onTouchEnd}
        >
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

/** Punto de color de cada clasificación: «Después» resalta con el color principal. */
const CATEGORY_DOT: Record<FileCategory, string> = {
  antes: "bg-muted-foreground/60",
  despues: "bg-primary",
  documento: "bg-muted-foreground/30",
  otro: "bg-muted-foreground/30",
};

/** Texto de la columna vacía cuando la otra (antes o después) ya tiene fotos. */
const EMPTY_COLUMN: Partial<Record<FileCategory, string>> = {
  antes: "Sin fotos de antes aún",
  despues: "Sin fotos de después aún",
};

/**
 * Una foto en miniatura de tamaño fijo: al pulsarla se abre el visor y, si se puede,
 * lleva un botón chico de borrar en la esquina. Debajo, la fecha de subida.
 */
function PhotoTile({
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
  return (
    <li className="w-24 sm:w-28 lg:w-32" data-testid="miniatura">
      <div className="group relative">
        <button
          type="button"
          aria-label={`Ver ${file.name}`}
          title="Ver en grande"
          onClick={onOpen}
          className="bg-muted focus-visible:ring-ring/50 relative block size-24 cursor-zoom-in overflow-hidden rounded-md border shadow-xs transition outline-none hover:shadow-md focus-visible:ring-[3px] sm:size-28 lg:size-32"
        >
          <Thumbnail
            file={file}
            className="transition-transform duration-300 group-hover:scale-105"
          />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/15 group-hover:opacity-100"
          >
            <ZoomIn className="size-6 drop-shadow" />
          </span>
        </button>
        {canDelete ? (
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label={`Borrar ${file.name}`}
            title="Borrar"
            onClick={onDelete}
            className="bg-background/90 hover:bg-background hover:text-destructive absolute top-1.5 right-1.5 rounded-full shadow-sm backdrop-blur-sm"
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1 truncate text-xs tabular-nums">
        {formatDate(file.createdAt)}
      </p>
    </li>
  );
}

/**
 * Las fotos de una clasificación (p. ej. «Antes (2)»): un rótulo chico con su punto
 * de color y la cantidad, y las miniaturas en fila. Sin fotos, un recuadro punteado.
 */
function CategoryGroup({
  category,
  files,
  canDelete,
  onOpen,
  onDelete,
}: {
  category: FileCategory;
  files: RestorationFile[];
  canDelete: (file: RestorationFile) => boolean;
  onOpen: (file: RestorationFile) => void;
  onDelete: (file: RestorationFile) => void;
}) {
  const label = FILE_CATEGORY_LABELS[category];
  return (
    <div
      role="group"
      aria-label={`${label} (${files.length})`}
      className="min-w-0 space-y-2"
    >
      <p aria-hidden className="flex items-center gap-1.5 text-sm font-medium">
        <span className={cn("size-2 rounded-full", CATEGORY_DOT[category])} />
        {label}
        <span className="text-muted-foreground font-normal tabular-nums">
          {files.length}
        </span>
      </p>
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <PhotoTile
              key={f.id}
              file={f}
              canDelete={canDelete(f)}
              onOpen={() => onOpen(f)}
              onDelete={() => onDelete(f)}
            />
          ))}
        </ul>
      ) : (
        // Del mismo tamaño que una miniatura, para que las dos columnas se vean parejas.
        <p className="text-muted-foreground bg-muted/30 flex size-24 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-center text-xs sm:size-28 lg:size-32">
          <ImageIcon className="size-5 opacity-50" aria-hidden />
          {EMPTY_COLUMN[category]}
        </p>
      )}
    </div>
  );
}

/**
 * Las fotos de un destino: Antes y Después lado a lado (si la tarjeta da), con
 * miniaturas de tamaño fijo; debajo, Documento y Otro si hay. Lo que no se ve como
 * foto (PDF, HEIC) va aparte, en una lista compacta. Con `card`, en su tarjeta.
 */
function TargetSection({
  target,
  files,
  showLabel,
  card,
  canDelete,
  onOpen,
  onDelete,
  onCompare,
}: {
  target: FileTarget;
  files: RestorationFile[];
  showLabel: boolean;
  card: boolean;
  canDelete: (file: RestorationFile) => boolean;
  onOpen: (file: RestorationFile, kind: ViewKind) => void;
  onDelete: (file: RestorationFile) => void;
  onCompare?: () => void;
}) {
  const images = files.filter(viewable);
  const of = (category: FileCategory) =>
    images.filter((f) => f.category === category);
  const before = of("antes");
  const after = of("despues");
  const extra = (["documento", "otro"] as const)
    .map((category) => ({ category, files: of(category) }))
    .filter((g) => g.files.length > 0);
  const others = groupByCategory(files.filter((f) => !viewable(f))).flatMap(
    (g) => g.files,
  );

  const group = (category: FileCategory, list: RestorationFile[]) => (
    <CategoryGroup
      key={category}
      category={category}
      files={list}
      canDelete={canDelete}
      onOpen={(f) => onOpen(f, "images")}
      onDelete={onDelete}
    />
  );

  const headingId = `archivos-${target.id ?? "general"}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "@container min-w-0 space-y-4",
        card && "bg-card rounded-lg border p-4 shadow-xs",
      )}
      data-testid={headingId}
    >
      <div
        className={cn(
          "flex min-h-8 flex-wrap items-center justify-between gap-2",
          !showLabel && !onCompare && "sr-only",
        )}
      >
        <h2
          id={headingId}
          className={cn("min-w-0 font-semibold", !showLabel && "sr-only")}
        >
          {target.label}
        </h2>
        {onCompare ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCompare}
            className={cn(!showLabel && "ml-auto")}
          >
            <Columns2 />
            Comparar antes y después
          </Button>
        ) : null}
      </div>

      {before.length > 0 || after.length > 0 ? (
        // Lado a lado aun en el celular; solo en tarjetas muy angostas se apilan.
        <div className="grid gap-4 @xs:grid-cols-2">
          {group("antes", before)}
          {group("despues", after)}
        </div>
      ) : null}

      {extra.length > 0 ? (
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {extra.map((g) => group(g.category, g.files))}
        </div>
      ) : null}

      {others.length > 0 ? (
        <ul aria-label="Archivos" className="divide-y rounded-lg border">
          {others.map((f) => {
            const Icon =
              f.mimeType === "application/pdf" ? FileText : ImageIcon;
            return (
              <li key={f.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  aria-label={`Ver ${f.name}`}
                  title="Ver archivo"
                  onClick={() => onOpen(f, "others")}
                  className="hover:bg-accent/60 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left outline-none focus-visible:ring-[3px]"
                >
                  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {f.name}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {FILE_CATEGORY_LABELS[f.category]} ·{" "}
                      {formatFileSize(f.sizeBytes)}
                    </span>
                  </span>
                </button>
                {canDelete(f) ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Borrar ${f.name}`}
                    title="Borrar"
                    onClick={() => onDelete(f)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Galería de la restauración (Paso 10.2): por destino (general y cada pieza), una
 * tarjeta con las fotos de antes y después lado a lado, en miniaturas de tamaño
 * fijo; visor ampliado con anterior/siguiente, descarga, comparación antes/después y
 * borrado con confirmación (admin o quien lo subió, P32). Se adapta a columnas
 * angostas: en el celular las columnas se apilan.
 */
export function FileGallery({
  files,
  targets,
  currentUserId,
  isAdmin,
  emptyText = "Aún no hay fotos ni archivos.",
  className,
  showTargetLabels = true,
}: {
  files: RestorationFile[];
  targets: FileTarget[];
  currentUserId: string;
  isAdmin: boolean;
  emptyText?: string;
  className?: string;
  /**
   * Muestra el nombre de cada destino («RES-00001-1 · Fuente») sobre sus fotos. Con
   * false queda solo para lectores de pantalla (p. ej. en la ficha de la pieza).
   */
  showTargetLabels?: boolean;
}) {
  const [viewing, setViewing] = useState<{
    target: string | null;
    kind: ViewKind;
    id: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<RestorationFile | null>(null);
  const [comparing, setComparing] = useState<FileTarget | null>(null);
  const canDelete = (f: RestorationFile) =>
    isAdmin || f.createdBy === currentUserId;

  const sections = targets
    .map((target) => ({
      target,
      files: files.filter((f) => f.pieceId === target.id),
    }))
    .filter((s) => s.files.length > 0);

  if (sections.length === 0)
    return (
      <div
        className={cn(
          "text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm",
          className,
        )}
      >
        <ImageIcon className="size-8 opacity-50" aria-hidden />
        <p>{emptyText}</p>
      </div>
    );

  const comparable = (list: RestorationFile[]) => ({
    before: list.filter((f) => f.category === "antes" && viewable(f)),
    after: list.filter((f) => f.category === "despues" && viewable(f)),
  });

  // El visor recorre lo mismo que se ve junto: las fotos, o los demás archivos.
  const viewList = viewing
    ? groupByCategory(
        (
          sections.find((s) => s.target.id === viewing.target)?.files ?? []
        ).filter((f) => viewable(f) === (viewing.kind === "images")),
      ).flatMap((g) => g.files)
    : [];
  const viewIndex = viewing
    ? viewList.findIndex((f) => f.id === viewing.id)
    : -1;

  return (
    <div className={cn("@container", className)}>
      {/* Con espacio de sobra (p. ej. a 1920 px) las tarjetas van de a dos. */}
      <div className="grid gap-4 @5xl:grid-cols-2">
        {sections.map(({ target, files: list }) => {
          const pair = comparable(list);
          return (
            <TargetSection
              key={target.id ?? "general"}
              target={target}
              files={list}
              showLabel={showTargetLabels}
              // Sin nombres (ficha de la pieza) la galería ya va dentro de una tarjeta.
              card={showTargetLabels}
              canDelete={canDelete}
              onOpen={(f, kind) =>
                setViewing({ target: target.id, kind, id: f.id })
              }
              onDelete={setDeleting}
              onCompare={
                pair.before.length > 0 && pair.after.length > 0
                  ? () => setComparing(target)
                  : undefined
              }
            />
          );
        })}
      </div>
      {viewing && viewIndex >= 0 ? (
        <Viewer
          files={viewList}
          index={viewIndex}
          canDelete={canDelete}
          onNavigate={(i) => setViewing({ ...viewing, id: viewList[i]!.id })}
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
