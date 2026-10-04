"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";
import { LOGO_TYPES, logoFileError } from "@/lib/validation/settings";
import { setLogo } from "@/server/settings-actions";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function LogoUploader({ logoUrl }: { logoUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (file: File) => {
    const fileError = logoFileError(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError(null);
    startTransition(async () => {
      const path = `logo/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
      const storage = createClient().storage.from("branding");
      const { error: uploadError } = await storage.upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
      });
      if (uploadError) {
        setError("No se pudo subir el logo. Intenta de nuevo.");
        return;
      }
      const result = await setLogo(path);
      if ("error" in result) {
        await storage.remove([path]);
        setError(result.error);
        return;
      }
      toast.success("Logo actualizado.");
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await setLogo(null);
      if ("error" in result) setError(result.error);
      else toast.success("Logo eliminado.");
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="bg-muted/40 flex h-24 w-48 items-center justify-center rounded-md border p-2">
          {logoUrl ? (
            // El logo vive en Supabase Storage; next/image necesitaría configurar su dominio.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo de la empresa"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-muted-foreground text-sm">Sin logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <ImageUp />
            {pending ? "Guardando…" : logoUrl ? "Cambiar logo" : "Subir logo"}
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={remove}
            >
              <Trash2 />
              Quitar
            </Button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept={LOGO_TYPES.join(",")}
          className="sr-only"
          aria-label="Archivo del logo"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        PNG, JPG o WebP de hasta 2 MB. Se usa en las cotizaciones en PDF.
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
