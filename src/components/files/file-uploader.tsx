"use client";

import { Camera, CheckCircle2, Loader2, RotateCw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FILE_ACCEPT,
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  fileError,
  fileMimeType,
  filePath,
  type FileCategory,
} from "@/domain/files";
import { compressImage } from "@/lib/images/compress";
import { createClient } from "@/lib/supabase/browser";
import { registerRestorationFile } from "@/server/files/actions";

import type { FileTarget } from "./types";

const GENERAL = "general";

type UploadStatus = "subiendo" | "listo" | "error";

type UploadItem = {
  key: string;
  file: File;
  pieceId: string | null;
  category: FileCategory;
  status: UploadStatus;
  error?: string;
};

const BUCKET = "restoration-files";

/** Comprime (si es foto), sube al bucket y registra. Devuelve el error, si lo hay. */
async function uploadOne(
  restorationId: string,
  item: UploadItem,
): Promise<string | null> {
  const file = await compressImage(item.file);
  const mimeType = fileMimeType(file);
  if (!mimeType) return "Tipo de archivo no permitido.";
  const fileId = crypto.randomUUID();
  const path = filePath(restorationId, item.pieceId, fileId, mimeType);
  const { error } = await createClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: mimeType });
  if (error) return "No se pudo subir. Revisa la conexión e intenta de nuevo.";
  const result = await registerRestorationFile({
    restorationId,
    pieceId: item.pieceId,
    fileId,
    name: file.name,
    mimeType,
    sizeBytes: file.size,
    category: item.category,
  });
  return "error" in result ? result.error : null;
}

/**
 * Subida de fotos y archivos (Paso 10.2, P32): varios a la vez o con la cámara del
 * celular, a la restauración (foto general) o a una pieza, con su clasificación.
 */
export function FileUploader({
  restorationId,
  targets,
}: {
  restorationId: string;
  targets: FileTarget[];
}) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState(GENERAL);
  const [category, setCategory] = useState<FileCategory>("antes");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) =>
      list.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );

  const run = async (batch: UploadItem[]) => {
    let ok = 0;
    for (const item of batch) {
      update(item.key, { status: "subiendo", error: undefined });
      const error = await uploadOne(restorationId, item).catch(
        () => "No se pudo subir. Intenta de nuevo.",
      );
      update(
        item.key,
        error ? { status: "error", error } : { status: "listo" },
      );
      if (!error) ok += 1;
    }
    if (ok > 0) {
      toast.success(ok === 1 ? "Archivo subido." : `${ok} archivos subidos.`);
      router.refresh();
    }
  };

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const all = Array.from(files);
    setRejected(
      all.map((f) => fileError(f)).filter((e): e is string => e !== null),
    );
    const batch: UploadItem[] = all
      .filter((f) => !fileError(f))
      .map((file) => ({
        key: crypto.randomUUID(),
        file,
        pieceId: target === GENERAL ? null : target,
        category,
        status: "subiendo",
      }));
    if (batch.length === 0) return;
    // Los ya subidos salen de la lista; los que fallaron quedan para reintentar.
    setItems((list) => [...list.filter((i) => i.status !== "listo"), ...batch]);
    void run(batch);
  };

  const busy = items.some((i) => i.status === "subiendo");

  return (
    <section
      aria-labelledby="subir-archivos"
      className="space-y-3 rounded-md border p-4"
    >
      <h2 id="subir-archivos" className="font-semibold">
        Subir fotos y archivos
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="archivo-destino">Para</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="archivo-destino" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.id ?? GENERAL} value={t.id ?? GENERAL}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="archivo-clasificacion">Clasificación</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as FileCategory)}
          >
            <SelectTrigger id="archivo-clasificacion" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {FILE_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => picker.current?.click()}>
          <Upload />
          Elegir archivos
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => camera.current?.click()}
        >
          <Camera />
          Tomar foto
        </Button>
        <input
          ref={picker}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="sr-only"
          aria-label="Archivos a subir"
          tabIndex={-1}
          onChange={(event) => {
            add(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Foto con la cámara"
          tabIndex={-1}
          onChange={(event) => {
            add(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Fotos (JPG, PNG, WebP, HEIC) y PDF de hasta 10 MB. Las fotos se reducen
        antes de subirlas.
      </p>
      {rejected.length > 0 ? (
        <div role="alert" className="text-destructive space-y-1 text-sm">
          {rejected.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul aria-label="Subidas" aria-busy={busy} className="space-y-1 text-sm">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-2"
              data-testid="subida"
            >
              {item.status === "subiendo" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : item.status === "listo" ? (
                <CheckCircle2 className="size-4 text-green-600" aria-hidden />
              ) : null}
              <span className="min-w-0 truncate">{item.file.name}</span>
              <span className="text-muted-foreground">
                {item.status === "subiendo"
                  ? "Subiendo…"
                  : item.status === "listo"
                    ? "Listo"
                    : item.error}
              </span>
              {item.status === "error" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void run([item])}
                >
                  <RotateCw />
                  Reintentar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
