import { formatDate } from "@/lib/format";

import { formatCents, type Cents, type PaymentType } from "./money";
import {
  isClosedStatus,
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "./piece-state-machine";
import {
  RESTORATION_STATUS_LABELS,
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
  description: string;
  materialName: string;
  serviceName: string;
  measure: string;
  weightGrams: number | null;
  status: PieceStatus;
  notes: string;
  /** null si no tiene precio de venta o si quien exporta no ve montos (P42). */
  priceCents: Cents | null;
};

export type GuidePdfCompany = {
  name: string;
  ruc: string | null;
  address: string;
  phones: string;
  email: string;
};

export type GuidePdfData = {
  company: GuidePdfCompany;
  code: string;
  createdAt: string;
  status: RestorationStatus;
  paymentType: PaymentType;
  clientName: string;
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
  description: string;
  /** Material, medida y peso. */
  detail: string;
  service: string;
  status: string;
  price: string | null;
  notes: string;
};

export type GuidePdfTotal = { label: string; value: string; strong?: boolean };

export type GuidePdfModel = {
  title: string;
  code: string;
  /** Datos de la empresa bajo el logo, una línea cada uno. */
  companyLines: string[];
  /** Recuadro de la esquina: fecha y número de guía. */
  meta: [label: string, value: string][];
  /** Vacío en la versión para taller (no se dibuja el bloque del cliente). */
  client: string[];
  guide: [label: string, value: string][];
  showPrice: boolean;
  /** Versión para taller: la tabla lleva siempre la foto de cada pieza. */
  forWorkshop: boolean;
  rows: GuidePdfRow[];
  /** Subtotal de las piezas elegidas que se cobran (sin anuladas, rechazadas ni sin arreglo). */
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
  // El taller no ve precios de venta.
  const showPrice = data.money !== null && !forWorkshop;
  const { company } = data;

  const totals: GuidePdfTotal[] = [];
  let totalsNote: string | null = null;
  if (showPrice) {
    const charged = pieces.filter((p) => !isClosedStatus(p.status));
    const priced = charged.filter((p) => p.priceCents !== null);
    const pending = charged.length - priced.length;
    // Sin ninguna pieza con precio, el subtotal no es 0: está por definir.
    totals.push({
      label: "Subtotal",
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
    companyLines: [
      "Oficina",
      company.ruc ? `RUC ${company.ruc}` : "",
      company.address,
      company.phones ? `Teléfono: ${company.phones}` : "",
      company.email,
    ]
      .map((s) => s.trim())
      .filter(Boolean),
    meta: [
      ["Fecha", formatDate(data.createdAt)],
      ["Guía N°", data.code],
    ],
    client: forWorkshop
      ? []
      : [
          data.clientName,
          data.contactName ? `Contacto: ${data.contactName}` : "",
          data.phone ? `Teléfono: ${data.phone}` : "",
        ].filter(Boolean),
    guide: [
      ["Estado", RESTORATION_STATUS_LABELS[data.status]],
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
      description: p.description,
      detail: pieceDetail(p),
      service: p.serviceName.trim() || "—",
      status: PIECE_STATUS_LABELS[p.status],
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
