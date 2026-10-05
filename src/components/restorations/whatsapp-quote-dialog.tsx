"use client";

import { Copy, MessageCircle } from "lucide-react";
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
import { whatsappUrl } from "@/domain/whatsapp-quote";

/**
 * Vista previa del mensaje de cotización (Paso 7.5) con "Copiar" y, si el cliente
 * tiene un teléfono válido, "Abrir WhatsApp". El mensaje se arma afuera con
 * `buildQuoteMessage()`.
 */
export function WhatsAppQuoteDialog({
  open,
  onOpenChange,
  message,
  phone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  /** Teléfono del contacto o del cliente, en cualquier formato que acepte `normalizePhone`. */
  phone: string | null | undefined;
}) {
  const url = whatsappUrl(phone, message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No se pudo copiar el mensaje; selecciónalo y cópialo.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mensaje de cotización</DialogTitle>
          <DialogDescription>
            {url
              ? "Cópialo o ábrelo en WhatsApp para enviárselo al cliente."
              : "Cópialo para enviárselo al cliente; no tiene un teléfono válido para abrir WhatsApp."}
          </DialogDescription>
        </DialogHeader>
        <pre
          data-testid="mensaje-cotizacion"
          className="bg-muted max-h-[50vh] overflow-y-auto rounded-md p-3 font-sans text-sm break-words whitespace-pre-wrap"
        >
          {message}
        </pre>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={copy}>
            <Copy />
            Copiar
          </Button>
          {url && (
            <Button asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Abrir WhatsApp
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
