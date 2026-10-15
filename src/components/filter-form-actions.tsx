import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Cierre de un formulario de filtros en tiempo real: no hay botón "Filtrar" (se aplica
 * al escribir o elegir); "Limpiar" quita todo y un aviso discreto dice que se está
 * buscando. Incluye un botón oculto para que Enter en la búsqueda aplique de inmediato.
 */
export function FilterFormActions({
  onReset,
  pending,
  children,
}: {
  onReset: () => void;
  pending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-2">
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        Buscar
      </button>
      {children}
      <Button type="button" variant="outline" onClick={onReset}>
        <X aria-hidden />
        Limpiar
      </Button>
      <span
        role="status"
        aria-live="polite"
        className="text-muted-foreground flex h-9 items-center"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="sr-only">Buscando…</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
