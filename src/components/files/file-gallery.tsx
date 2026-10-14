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
  useEffect,
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
import { formatDateTime } from "@/lib/format";
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

/** Etiqueta de clasificación sobre la foto: «Después» resalta con el color principal. */
function CategoryBadge({
  category,
  className,
}: {
  category: FileCategory;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium shadow-sm",
        category === "despues"
          ? "bg-primary text-primary-foreground"
          : "bg-background/90 text-foreground border",
        className,
      )}
    >
      {FILE_CATEGORY_LABELS[category]}
    </span>
  );
}

/** Botón redondo semitransparente que va encima de la foto. */
const OVERLAY_BUTTON =
  "bg-background/85 text-foreground hover:bg-background absolute rounded-full shadow-sm backdrop-blur-sm";

/**
 * Las fotos de un destino, al estilo de una ficha de producto: una grande (con su
 * clasificación, flechas, teclado y deslizar), un selector Antes / Después con
 * cuántas hay y las miniaturas debajo, agrupadas por clasificación. Lo que no se ve
 * como foto (PDF, HEIC) va aparte, en una lista compacta.
 */
function TargetSection({
  target,
  files,
  showLabel,
  canDelete,
  onOpen,
  onDelete,
  onCompare,
}: {
  target: FileTarget;
  files: RestorationFile[];
  showLabel: boolean;
  canDelete: (file: RestorationFile) => boolean;
  onOpen: (file: RestorationFile, kind: ViewKind) => void;
  onDelete: (file: RestorationFile) => void;
  onCompare?: () => void;
}) {
  const groups = groupByCategory(files.filter(viewable));
  const images = groups.flatMap((g) => g.files);
  const others = groupByCategory(files.filter((f) => !viewable(f))).flatMap(
    (g) => g.files,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Si la foto elegida se borró, vuelve a la primera.
  const index = Math.max(
    0,
    images.findIndex((f) => f.id === selectedId),
  );
  const current = images[index];
  const many = images.length > 1;

  const select = (i: number) => {
    const n = images.length;
    if (n > 0) setSelectedId(images[(i + n) % n]!.id);
  };
  const prev = many ? () => select(index - 1) : undefined;
  const next = many ? () => select(index + 1) : undefined;
  const stepper = useStepper(prev, next);

  // Lleva la miniatura elegida a la vista dentro de la tira, sin mover la página.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current;
    if (!selectedId || !box) return;
    const thumb = box.querySelector<HTMLElement>(
      `[data-file-id="${selectedId}"]`,
    );
    if (!thumb) return;
    const left = thumb.offsetLeft - box.clientWidth / 2 + thumb.clientWidth / 2;
    box.scrollTo?.({ left, behavior: "smooth" });
  }, [selectedId]);

  const headingId = `archivos-${target.id ?? "general"}`;

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 space-y-3"
      data-testid={headingId}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2",
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

      {current ? (
        <div className="space-y-2.5">
          <div
            role="group"
            aria-roledescription="carrusel"
            aria-label="Fotos"
            tabIndex={many ? 0 : undefined}
            onKeyDown={stepper.onKeyDown}
            onTouchStart={stepper.onTouchStart}
            onTouchEnd={stepper.onTouchEnd}
            className="bg-muted/60 focus-visible:ring-ring/50 group relative aspect-[4/3] w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-[3px]"
            data-testid="foto-principal"
          >
            <button
              type="button"
              aria-label={`Ver ${current.name}`}
              title="Ver en grande"
              onClick={() => onOpen(current, "images")}
              className="block size-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current.id}
                src={current.url!}
                alt={current.name}
                draggable={false}
                className="size-full object-contain"
              />
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/10 group-hover:opacity-100"
              >
                <ZoomIn className="size-7 drop-shadow" />
              </span>
            </button>
            <CategoryBadge
              category={current.category}
              className="pointer-events-none absolute top-2 left-2"
            />
            {canDelete(current) ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={`Borrar ${current.name}`}
                title="Borrar"
                onClick={() => onDelete(current)}
                className={cn(
                  OVERLAY_BUTTON,
                  "hover:text-destructive top-2 right-2",
                )}
              >
                <Trash2 />
              </Button>
            ) : null}
            {prev ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Foto anterior"
                onClick={prev}
                className={cn(
                  OVERLAY_BUTTON,
                  "top-1/2 left-2 -translate-y-1/2",
                )}
              >
                <ChevronLeft className="size-5" />
              </Button>
            ) : null}
            {next ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Foto siguiente"
                onClick={next}
                className={cn(
                  OVERLAY_BUTTON,
                  "top-1/2 right-2 -translate-y-1/2",
                )}
              >
                <ChevronRight className="size-5" />
              </Button>
            ) : null}
            {many ? (
              <span
                aria-live="polite"
                className="bg-background/85 pointer-events-none absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-xs tabular-nums shadow-sm"
              >
                {index + 1} de {images.length}
              </span>
            ) : null}
          </div>

          {groups.length > 1 ? (
            <div
              role="group"
              aria-label="Clasificación"
              className="bg-muted inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1"
            >
              {groups.map((g) => {
                const active = g.category === current.category;
                return (
                  <button
                    key={g.category}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${FILE_CATEGORY_LABELS[g.category]} (${g.files.length})`}
                    onClick={() => setSelectedId(g.files[0]!.id)}
                    className={cn(
                      "focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px]",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {FILE_CATEGORY_LABELS[g.category]}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs tabular-nums",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-background/70",
                      )}
                    >
                      {g.files.length}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {many ? (
            <div
              ref={strip}
              className="relative flex snap-x gap-3 overflow-x-auto pb-1"
            >
              {groups.map((g) => (
                <div
                  key={g.category}
                  role="group"
                  aria-label={`${FILE_CATEGORY_LABELS[g.category]} (${g.files.length})`}
                  className="flex shrink-0 flex-col gap-1"
                >
                  <span
                    aria-hidden
                    className="text-muted-foreground text-xs font-medium"
                  >
                    {FILE_CATEGORY_LABELS[g.category]}
                  </span>
                  <ul className="flex gap-1.5">
                    {g.files.map((f) => {
                      const selected = f.id === current.id;
                      return (
                        <li
                          key={f.id}
                          className="snap-start"
                          data-testid="miniatura"
                        >
                          <button
                            type="button"
                            data-file-id={f.id}
                            aria-label={`Mostrar ${f.name}`}
                            aria-current={selected ? "true" : undefined}
                            onClick={() => setSelectedId(f.id)}
                            className={cn(
                              "focus-visible:ring-ring/50 block size-14 overflow-hidden rounded-md border-2 transition outline-none focus-visible:ring-[3px] sm:size-16",
                              selected
                                ? "border-primary"
                                : "border-transparent opacity-70 hover:opacity-100",
                            )}
                          >
                            <Thumbnail file={f} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
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
 * foto grande con flechas y miniaturas por clasificación; visor ampliado con
 * anterior/siguiente, descarga, comparación antes/después y borrado con
 * confirmación (admin o quien lo subió, P32). Se adapta a columnas angostas.
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
    <div className={cn("space-y-8", className)}>
      {sections.map(({ target, files: list }) => {
        const pair = comparable(list);
        return (
          <TargetSection
            key={target.id ?? "general"}
            target={target}
            files={list}
            showLabel={showTargetLabels}
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
