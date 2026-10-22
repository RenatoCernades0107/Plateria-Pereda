"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import {
  buildQuoteMessage,
  isQuoteSelectedByDefault,
  type QuoteMessageData,
  type QuotePiece,
} from "@/domain/whatsapp-quote";

import { WhatsAppQuoteDialog } from "./whatsapp-quote-dialog";

export type QuoteMessagePiece = QuotePiece & { id: string; code: string };

/**
 * Botón "Mensaje de cotización" del detalle (Paso 7.5). El diálogo deja elegir qué
 * piezas van en el mensaje (por defecto, todas menos las anuladas, rechazadas y sin
 * arreglo); el mensaje y los totales se arman solo con las elegidas. Recién
 * registrada la restauración (`autoOpen`) el diálogo se abre solo; al cerrarlo se
 * limpia la URL para que no vuelva a abrirse al recargar.
 */
export function RestorationQuoteMessageButton({
  template,
  data,
  pieces,
  phone,
  autoOpen = false,
}: {
  template: string;
  data: Omit<QuoteMessageData, "pieces" | "includeClosed">;
  pieces: QuoteMessagePiece[];
  phone: string | null;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(autoOpen);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        pieces
          .filter((p) => isQuoteSelectedByDefault(p.status))
          .map((p) => p.id),
      ),
  );
  const message = useMemo(
    () =>
      buildQuoteMessage(template, {
        ...data,
        pieces: pieces.filter((p) => selected.has(p.id)),
        includeClosed: true,
      }),
    [template, data, pieces, selected],
  );

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <WhatsAppIcon className="text-whatsapp-strong" />
        Mensaje de cotización
      </Button>
      <WhatsAppQuoteDialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value && autoOpen) router.replace(pathname, { scroll: false });
        }}
        message={message}
        phone={phone}
        empty={selected.size === 0}
      >
        <fieldset className="min-w-0 space-y-1">
          <legend className="text-muted-foreground mb-1 text-xs font-medium">
            Piezas en el mensaje ({selected.size}/{pieces.length})
          </legend>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {pieces.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary size-4 shrink-0"
                    checked={selected.has(p.id)}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                  />
                  {/* En pantallas angostas la descripción y el estado bajan de línea. */}
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{p.code}</span>
                    <span className="min-w-0 truncate">{p.description}</span>
                    {!isQuoteSelectedByDefault(p.status) ? (
                      <span className="text-muted-foreground text-xs">
                        ({PIECE_STATUS_LABELS[p.status]})
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </WhatsAppQuoteDialog>
    </>
  );
}
