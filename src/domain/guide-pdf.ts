import { formatDate } from "@/lib/format";

import { DOCUMENT_LABELS, type DocumentType } from "./documents";
import { formatCents, type Cents, type PaymentType } from "./money";
import {
  isClosedStatus,
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "./piece-state-machine";
import {
  PIECE_LOCATION_LABELS,
  RESTORATION_KIND_LABELS,
  RESTORATION_STATUS_LABELS,
  type PieceLocation,
  type RestorationKind,
  type RestorationStatus,
} from "./restoration-status";

/**
 * Exportar la guía (la restauración) en PDF con las piezas que se elijan (por
 * defecto, todas). Aquí se arma el contenido; el dibujo con jsPDF está en
 * `components/restorations/guide-pdf-button.tsx`.
 */

export type GuidePdfPiece = {
  id: string;
  code: string;
  /** Unidades (informativa: el precio es de la pieza completa). */
  quantity: number;
  description: string;
  materialName: string;
  serviceName: string;
  measure: string;
  weightGrams: number | null;
  status: PieceStatus;
  location: PieceLocation;
  notes: string;
  /** null si no tiene precio de venta o si quien exporta no ve montos (P42). */
  priceCents: Cents | null;
};

export type GuidePdfCompany = {
  name: string;
  phones: string;
  email: string;
};

/** Ícono que va a la izquierda de una línea del membrete (`components/restorations/pdf-icons.ts`). */
export type GuidePdfIcon = "whatsapp" | "facebook" | "web";

export type GuidePdfLetterheadLine = { text: string; icon?: GuidePdfIcon };

/**
 * Datos del encabezado de la guía, como en la guía impresa de la oficina principal.
 * Son fijos (no salen de Configuración): la guía lleva siempre este membrete.
 */
export const GUIDE_LETTERHEAD: readonly GuidePdfLetterheadLine[] = [
  { text: "OFICINA PRINCIPAL MIRAFLORES:" },
  { text: "Calle Coronel Inclán 928, Miraflores, Lima - Lima" },
  { text: "995 711 235", icon: "whatsapp" },
  { text: "Pereda.Plateria.Joyeria", icon: "facebook" },
  { text: "www.plateriapereda.com", icon: "web" },
];

/** Membrete de la versión para taller: sin datos de la empresa, solo el rótulo. */
export const WORKSHOP_LETTERHEAD: readonly GuidePdfLetterheadLine[] = [
  { text: "TALLER" },
];

export type GuidePdfData = {
  company: GuidePdfCompany;
  code: string;
  createdAt: string;
  status: RestorationStatus;
  /** Interna u observada: no se cobra, el PDF va sin importes ni total. */
  kind: RestorationKind;
  paymentType: PaymentType;
  clientName: string;
  /** Documento del cliente (opcional): sin él, la línea "DNI:" queda en blanco. */
  document?: { type: DocumentType; number: string } | null;
  contactName: string | null;
  phone: string | null;
  shopifyOrderName: string | null;
  /** Nombre de quien registró la guía. */
  attendedBy: string | null;
  notes: string;
  pieces: GuidePdfPiece[];
  /** Solo para quien ve montos (admin y ventas, P42). */
  money: {
    totalCents: Cents;
    paidCents: Cents;
  } | null;
};

export type GuidePdfOptions = {
  /** Versión para el taller: sin datos del cliente ni precios de venta. */
  forWorkshop?: boolean;
};

/** Cláusula para el cliente, al pie de la guía. */
export const PICKUP_CLAUSE =
  "IMPORTANTE: Una vez notificado que su trabajo se encuentra listo, el cliente tendrá un plazo máximo de 30 días calendario para recogerlo.";

export type GuidePdfRow = {
  id: string;
  number: number;
  code: string;
  quantity: string;
  description: string;
  /** Material, medida y peso. */
  detail: string;
  service: string;
  status: string;
  location: string;
  price: string | null;
  notes: string;
};

export type GuidePdfTotal = { label: string; value: string; strong?: boolean };

export type GuidePdfModel = {
  title: string;
  code: string;
  /** Membrete junto al logo (`GUIDE_LETTERHEAD`), una línea cada uno; la primera va en negrita. */
  companyLines: GuidePdfLetterheadLine[];
  /** Recuadro de la esquina: fecha y número de guía. */
  meta: [label: string, value: string][];
  /** Vacío en la versión para taller (no se dibuja el bloque del cliente). */
  client: string[];
  guide: [label: string, value: string][];
  showPrice: boolean;
  /** Versión para taller: la tabla lleva siempre la foto de cada pieza. */
  forWorkshop: boolean;
  rows: GuidePdfRow[];
  /**
   * Suma de las piezas elegidas que se cobran (sin anuladas, rechazadas ni sin arreglo):
   * "Total" si todas tienen precio; si falta alguna, "Subtotal".
   */
  totals: GuidePdfTotal[];
  /** Aviso bajo el subtotal (p. ej. piezas por cotizar). */
  totalsNote: string | null;
  notes: string;
  /** Cláusula para el cliente; null en la versión para taller. */
  clause: string | null;
  /** Nombre que va bajo la firma de la empresa; null si no hay firmas. */
  signer: string | null;
  footer: string;
};

/** Nombre del archivo, p. ej. `guia-RES-00012.pdf`. */
export function guidePdfFileName(code: string): string {
  return `guia-${code.replace(/[^\w-]+/g, "_")}.pdf`;
}

/** Material, medida y peso de la pieza, en una línea. */
function pieceDetail(piece: GuidePdfPiece): string {
  return [
    piece.materialName,
    piece.measure,
    piece.weightGrams === null ? "" : `${piece.weightGrams} g`,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

export function guidePdfModel(
  data: GuidePdfData,
  selectedIds: ReadonlySet<string>,
  { forWorkshop = false }: GuidePdfOptions = {},
): GuidePdfModel {
  const pieces = data.pieces.filter((p) => selectedIds.has(p.id));
  // El taller no ve precios de venta; la guía interna u observada no se cobra.
  const showPrice =
    data.money !== null && !forWorkshop && data.kind === "normal";
  const { company } = data;

  const totals: GuidePdfTotal[] = [];
  let totalsNote: string | null = null;
  if (showPrice) {
    const charged = pieces.filter((p) => !isClosedStatus(p.status));
    const priced = charged.filter((p) => p.priceCents !== null);
    const pending = charged.length - priced.length;
    // Con todas las piezas con precio es el total; si falta alguna, solo un subtotal.
    // Sin ninguna pieza con precio no es 0: está por definir.
    totals.push({
      label: priced.length && !pending ? "Total" : "Subtotal",
      value: priced.length
        ? formatCents(priced.reduce((sum, p) => sum + p.priceCents!, 0))
        : "Por definir",
      strong: true,
    });
    if (priced.length && pending)
      totalsNote =
        pending === 1
          ? "Falta 1 pieza por cotizar."
          : `Faltan ${pending} piezas por cotizar.`;
  }

  const contact = [company.phones, company.email]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

  return {
    title: "GUÍA DE RESTAURACIÓN",
    code: data.code,
    companyLines: [...(forWorkshop ? WORKSHOP_LETTERHEAD : GUIDE_LETTERHEAD)],
    meta: [
      ["Fecha", formatDate(data.createdAt)],
      ["Guía N°", data.code],
    ],
    client: forWorkshop
      ? []
      : [
          data.clientName,
          data.document
            ? `${DOCUMENT_LABELS[data.document.type]}: ${data.document.number}`
            : "DNI:",
          data.contactName ? `Contacto: ${data.contactName}` : "",
          data.phone ? `Teléfono: ${data.phone}` : "",
        ].filter(Boolean),
    guide: [
      ["Estado", RESTORATION_STATUS_LABELS[data.status]],
      ...(data.kind !== "normal"
        ? ([
            [
              "Tipo",
              `Guía ${RESTORATION_KIND_LABELS[data.kind].toLowerCase()}`,
            ],
          ] as [string, string][])
        : []),
      ...(data.attendedBy
        ? ([["Atendió", data.attendedBy]] as [string, string][])
        : []),
      ["Piezas", `${pieces.length} de ${data.pieces.length}`],
      ...(data.shopifyOrderName && !forWorkshop
        ? ([["Orden", data.shopifyOrderName]] as [string, string][])
        : []),
    ],
    showPrice,
    forWorkshop,
    rows: pieces.map((p, i) => ({
      id: p.id,
      number: i + 1,
      code: p.code,
      quantity: String(p.quantity),
      description: p.description,
      detail: pieceDetail(p),
      service: p.serviceName.trim() || "—",
      status: PIECE_STATUS_LABELS[p.status],
      location: PIECE_LOCATION_LABELS[p.location],
      price: !showPrice
        ? null
        : isClosedStatus(p.status)
          ? "No se cobra"
          : p.priceCents === null
            ? "Por definir"
            : formatCents(p.priceCents),
      notes: p.notes.trim(),
    })),
    totals,
    totalsNote,
    notes: data.notes.trim(),
    clause: forWorkshop ? null : PICKUP_CLAUSE,
    signer: forWorkshop ? null : company.name.trim() || "Platería Pereda",
    footer: forWorkshop
      ? ""
      : contact
        ? `Si tiene alguna pregunta sobre esta guía, comuníquese con nosotros: ${contact}`
        : "Si tiene alguna pregunta sobre esta guía, comuníquese con nosotros.",
  };
}
