"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import {
  quotePdfFileName,
  quotePdfModel,
  quoteShareMessage,
  type QuotePdfData,
} from "@/domain/quote-pdf";
import { whatsappUrl } from "@/domain/whatsapp-quote";

import { drawQuotePdf } from "./quote-pdf-draw";
import { canShareFiles } from "./web-share";

const PDF_LOGO_URL = "/logo-pereda.png";

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(PDF_LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Sin el logo, el PDF sale igual.
    return null;
  }
}

async function buildPdf(data: QuotePdfData) {
  const model = quotePdfModel(data);
  const logo = await logoDataUrl();
  const pdf = await drawQuotePdf(model, { logo });
  return { pdf, fileName: quotePdfFileName(data.code) };
}

/**
 * Botones "Exportar PDF" y "Compartir por WhatsApp" del detalle de la cotización
 * (Pasos 14.5 y 14.6). En celular, "Compartir" abre el menú nativo con el PDF
 * adjunto (Web Share API); sin ese soporte (escritorio), descarga el PDF y abre
 * WhatsApp con un mensaje breve.
 */
export function QuotePdfButton({
  data,
  phone = null,
}: {
  data: QuotePdfData;
  /** Teléfono del cliente o del contacto, para el enlace de WhatsApp. */
  phone?: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const busy = exporting || sharing;

  async function exportPdf() {
    setExporting(true);
    try {
      const { pdf, fileName } = await buildPdf(data);
      pdf.save(fileName);
      toast.success("Cotización exportada en PDF.");
    } catch {
      toast.error("No se pudo exportar el PDF. Inténtalo de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  async function share() {
    setSharing(true);
    try {
      const { pdf, fileName } = await buildPdf(data);
      const blob = pdf.output("blob") as Blob;
      const message = quoteShareMessage(data.code, data.clientName);
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (canShareFiles(file)) {
        await navigator.share({ files: [file], text: message });
        return;
      }
      // Escritorio (o sin soporte): descarga el PDF y abre WhatsApp con el mensaje.
      pdf.save(fileName);
      const url = whatsappUrl(phone, message);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else
        toast.success(
          "Cotización descargada. Sin un teléfono válido para abrir WhatsApp.",
        );
    } catch (error) {
      // El usuario canceló el menú de compartir: no es un error.
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("No se pudo compartir la cotización. Inténtalo de nuevo.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={exportPdf} disabled={busy}>
        {exporting ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <FileDown className={PDF_ICON_CLASS} />
        )}
        Exportar PDF
      </Button>
      <Button variant="outline" onClick={share} disabled={busy}>
        {sharing ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <WhatsAppIcon className="text-whatsapp-strong" />
        )}
        Compartir por WhatsApp
      </Button>
    </>
  );
}
