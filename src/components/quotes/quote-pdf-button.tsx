"use client";

import { FileDown, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ContactDialog } from "@/components/clients/contact-dialog";
import { EditClientDialog } from "@/components/clients/edit-client-dialog";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PDF_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QUOTE_PDF_MISSING_ISSUER } from "@/domain/quote-issuers";
import {
  quotePdfFileName,
  quotePdfModel,
  quoteShareMessage,
  type QuotePdfData,
} from "@/domain/quote-pdf";
import type { WorkshopQuote } from "@/domain/quote-workshop-pdf";
import { whatsappUrl } from "@/domain/whatsapp-quote";
import { getClientForEdit } from "@/server/clients/actions";
import type { ClientDetail } from "@/server/clients/queries";

import { drawQuotePdf } from "./quote-pdf-draw";
import { exportWorkshopPdf } from "./quote-workshop-export";
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

/** Lado mayor (px) de las fotos de las filas: bastan para 16 mm a buena resolución. */
const PHOTO_PX = 400;

/**
 * Foto de una fila como data URL JPEG (reducida, sobre fondo blanco): así jsPDF la
 * dibuja aunque sea WebP o PNG. Si no se puede descargar o leer, la fila va sin foto.
 */
async function photoDataUrl(url: string): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const scale = Math.min(1, PHOTO_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

async function buildPdf(data: QuotePdfData) {
  const model = quotePdfModel(data);
  const [logo, images] = await Promise.all([
    logoDataUrl(),
    Promise.all(
      model.rows.map((row) => (row.image ? photoDataUrl(row.image) : null)),
    ),
  ]);
  const pdf = await drawQuotePdf(model, { logo, images });
  return { pdf, fileName: quotePdfFileName(data.code) };
}

type PdfAction = "export" | "share";

/** Quién se edita desde el aviso «sin teléfono»: el cliente o el contacto. */
type Editing =
  | { kind: "client"; client: ClientDetail }
  | {
      kind: "contact";
      client: ClientDetail;
      contact: ClientDetail["contacts"][number];
    };

/**
 * Botones "Exportar PDF" y "Compartir por WhatsApp" del detalle de la cotización
 * (Pasos 14.5 y 14.6). En celular, "Compartir" abre el menú nativo con el PDF
 * adjunto (Web Share API); sin ese soporte (escritorio), descarga el PDF y abre
 * WhatsApp con un mensaje breve. Con `workshop`, "Exportar PDF" abre un diálogo para
 * marcar si es la versión para taller (la orden para taller, sin precios y con las
 * instrucciones para el taller); con `workshopOnly` (p. ej. una anulada) solo se
 * exporta esa.
 */
export function QuotePdfButton({
  data,
  phone = null,
  clientId = null,
  contactId = null,
  canEditClient = false,
  workshop = null,
  workshopOnly = false,
  shareTemplate,
}: {
  data: QuotePdfData;
  /** La cotización para la orden para taller. */
  workshop?: WorkshopQuote | null;
  /** Solo la versión para taller. */
  workshopOnly?: boolean;
  /** Plantilla del mensaje al compartir (Configuración); sin ella, la de la aplicación. */
  shareTemplate?: string;
  /** Teléfono del cliente o del contacto, para el enlace de WhatsApp. */
  phone?: string | null;
  /** Cliente (y contacto) de la cotización, para agregarle el teléfono que falta. */
  clientId?: string | null;
  contactId?: string | null;
  /** Quien puede editar clientes ve «Editar cliente» en el aviso sin teléfono. */
  canEditClient?: boolean;
}) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  // Acción que espera la respuesta al aviso «sin teléfono».
  const [warning, setWarning] = useState<PdfAction | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // Diálogo "Exportar PDF" con la casilla "Para taller".
  const [choosing, setChoosing] = useState(false);
  const [forWorkshop, setForWorkshop] = useState(false);
  const busy = exporting || sharing || loadingClient;
  const who = contactId ? "El contacto" : "El cliente";

  /** Sin teléfono, primero se avisa; si acepta, se genera igual. */
  function start(action: PdfAction) {
    if (missingIssuer()) return;
    if (!data.phone) {
      setWarning(action);
      return;
    }
    void run(action);
  }

  function run(action: PdfAction) {
    return action === "export" ? exportPdf() : share();
  }

  async function editClient() {
    if (!clientId) return;
    setLoadingClient(true);
    try {
      const client = await getClientForEdit(clientId);
      const contact = contactId
        ? client?.contacts.find((k) => k.id === contactId)
        : null;
      if (!client || (contactId && !contact)) {
        toast.error("No se encontró el cliente.");
        return;
      }
      setWarning(null);
      setEditing(
        contact
          ? { kind: "contact", client, contact }
          : { kind: "client", client },
      );
    } catch {
      toast.error("No se pudo abrir el cliente. Inténtalo de nuevo.");
    } finally {
      setLoadingClient(false);
    }
  }

  function edited() {
    setEditing(null);
    router.refresh();
    toast.info("Ya puedes volver a generar el PDF con el teléfono.");
  }

  /** Sin sucursal no hay cuentas que mostrar: no se genera el PDF. */
  function missingIssuer(): boolean {
    if (data.issuer) return false;
    toast.error(QUOTE_PDF_MISSING_ISSUER);
    return true;
  }

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

  async function exportWorkshop() {
    if (!workshop) return;
    setExporting(true);
    try {
      await exportWorkshopPdf([workshop]);
      toast.success("Orden para taller exportada en PDF.");
      setChoosing(false);
    } catch {
      toast.error("No se pudo exportar el PDF. Inténtalo de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  function exportChosen() {
    if (forWorkshop) {
      void exportWorkshop();
      return;
    }
    setChoosing(false);
    start("export");
  }

  async function share() {
    setSharing(true);
    try {
      const { pdf, fileName } = await buildPdf(data);
      const blob = pdf.output("blob") as Blob;
      const message = quoteShareMessage(
        data.code,
        data.clientName,
        phone,
        shareTemplate,
      );
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

  if (workshopOnly && workshop) {
    return (
      <Button
        variant="outline"
        onClick={() => void exportWorkshop()}
        disabled={busy}
      >
        {exporting ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <FileDown className={PDF_ICON_CLASS} />
        )}
        PDF para taller
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          if (!workshop) {
            start("export");
            return;
          }
          setForWorkshop(false);
          setChoosing(true);
        }}
        disabled={busy}
      >
        {exporting && !choosing ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <FileDown className={PDF_ICON_CLASS} />
        )}
        Exportar PDF
      </Button>
      <Dialog
        open={choosing}
        onOpenChange={(open) => {
          if (!exporting) setChoosing(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar cotización en PDF</DialogTitle>
            <DialogDescription>
              Elige qué versión de {data.code} quieres exportar.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 size-4"
              checked={forWorkshop}
              onChange={(e) => setForWorkshop(e.target.checked)}
            />
            <span>
              Para taller
              <span className="text-muted-foreground block text-xs">
                Orden para taller: con el nombre del cliente, sin sus datos de
                contacto ni precios, con la foto, la variante y la
                personalización de cada producto, y las instrucciones para el
                taller.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setChoosing(false)}
              disabled={exporting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={exportChosen} disabled={exporting}>
              {exporting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <FileDown aria-hidden />
              )}
              Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" onClick={() => start("share")} disabled={busy}>
        {sharing ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <WhatsAppIcon className="text-whatsapp-strong" />
        )}
        Compartir por WhatsApp
      </Button>
      <Dialog
        open={warning !== null}
        onOpenChange={(open) => {
          if (!open && !loadingClient) setWarning(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{who} no tiene teléfono</DialogTitle>
            <DialogDescription>
              Si continúas, la cotización se generará sin teléfono.
              {canEditClient && clientId
                ? ` También puedes editar ${contactId ? "el contacto" : "el cliente"} y agregarle su teléfono.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {canEditClient && clientId ? (
              <Button
                variant="outline"
                disabled={loadingClient}
                onClick={() => void editClient()}
              >
                {loadingClient ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Pencil aria-hidden />
                )}
                {contactId ? "Editar contacto" : "Editar cliente"}
              </Button>
            ) : null}
            <Button
              disabled={loadingClient}
              onClick={() => {
                const action = warning;
                setWarning(null);
                if (action) void run(action);
              }}
            >
              Generar sin teléfono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editing?.kind === "client" ? (
        <EditClientDialog
          client={editing.client}
          trigger={null}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={edited}
        />
      ) : null}
      {editing?.kind === "contact" ? (
        <ContactDialog
          clientId={editing.client.id}
          companyName={editing.client.displayName}
          contact={editing.contact}
          trigger={null}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={edited}
        />
      ) : null}
    </>
  );
}
