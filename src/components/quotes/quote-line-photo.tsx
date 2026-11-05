"use client";

import { Camera, Loader2, Package, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  QUOTE_IMAGE_MAX_BYTES,
  QUOTE_IMAGE_TYPES,
  QUOTE_IMAGES_BUCKET,
  isQuoteImageType,
  quoteImagePath,
} from "@/domain/quote-images";
import type { QuoteLineDraft } from "@/domain/quote-line";
import { compressImage } from "@/lib/images/compress";
import { createClient } from "@/lib/supabase/browser";

type PhotoPatch = Pick<
  QuoteLineDraft,
  "referenceImagePath" | "referenceImageUrl"
>;

/** Sube la foto (comprimida) al bucket y devuelve su ruta. */
async function uploadPhoto(original: File): Promise<string> {
  const file = await compressImage(original);
  if (!isQuoteImageType(file.type)) {
    throw new Error("Sube una foto JPG, PNG o WebP.");
  }
  if (file.size > QUOTE_IMAGE_MAX_BYTES) {
    throw new Error("La foto pesa más de 10 MB.");
  }
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Tu sesión expiró. Vuelve a ingresar.");
  const path = quoteImagePath(data.user.id, file.type)!;
  const { error } = await supabase.storage
    .from(QUOTE_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error("No se pudo subir la foto. Inténtalo de nuevo.");
  return path;
}

/**
 * Foto del producto de la línea: la referencial subida (pedido del 2026-11-05) o, si no
 * hay, la de Shopify. En el borrador se agrega, cambia o quita; sale en el PDF.
 */
export function QuoteLinePhoto({
  line,
  label,
  disabled,
  onChange,
}: {
  line: QuoteLineDraft;
  /** Nombre de la línea para los botones ("Línea 1"). */
  label: string;
  disabled: boolean;
  onChange: (patch: PhotoPatch) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const src = line.referenceImageUrl ?? line.imageUrl;
  const hasReference = line.referenceImagePath !== null;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadPhoto(file);
      onChange({
        referenceImagePath: path,
        referenceImageUrl: URL.createObjectURL(file),
      });
      toast.success("Foto agregada. Guarda la cotización para conservarla.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo subir la foto.",
      );
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const thumbnail = src ? (
    // Foto subida (URL firmada o local) o del CDN de Shopify.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={hasReference ? `Foto referencial de ${label}` : ""}
      className="size-full object-cover"
    />
  ) : (
    <Package className="size-5" aria-hidden />
  );

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {src ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-muted flex size-16 items-center justify-center overflow-hidden rounded border"
          aria-label={`Ver foto de ${label}`}
          data-testid="foto-linea"
        >
          {thumbnail}
        </a>
      ) : (
        <span className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded border">
          {thumbnail}
        </span>
      )}
      {disabled ? null : (
        <div className="flex items-center gap-0.5">
          <input
            ref={input}
            type="file"
            accept={QUOTE_IMAGE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label={`Foto referencial de ${label}`}
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-xs"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Camera className="size-3.5" aria-hidden />
            )}
            {hasReference ? "Cambiar" : "Foto"}
          </Button>
          {hasReference ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Quitar foto de ${label}`}
              disabled={uploading}
              onClick={() =>
                onChange({ referenceImagePath: null, referenceImageUrl: null })
              }
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
