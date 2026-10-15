import { formatDate } from "@/lib/format";

import { igvLabel, igvTotals } from "./igv";
import {
  formatCents,
  PAYMENT_TYPE_LABELS,
  type Cents,
  type PaymentType,
} from "./money";
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
  notes: string;
  pieces: GuidePdfPiece[];
  /** Solo para quien ve montos (admin y ventas, P42). */
  money: {
    pricesIncludeIgv: boolean;
    totalCents: Cents;
    paidCents: Cents;
  } | null;
};

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
  /** Recuadro de la esquina: fecha, número de guía, exportado. */
  meta: [label: string, value: string][];
  client: string[];
  guide: [label: string, value: string][];
  showPrice: boolean;
  rows: GuidePdfRow[];
  /** Totales de las piezas elegidas que se cobran (sin anuladas, rechazadas ni sin arreglo). */
  totals: GuidePdfTotal[];
  /** Aviso bajo los totales (p. ej. piezas sin precio). */
  totalsNote: string | null;
  notes: string;
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
  now = new Date(),
): GuidePdfModel {
  const pieces = data.pieces.filter((p) => selectedIds.has(p.id));
  const showPrice = data.money !== null;
  const { company } = data;

  const totals: GuidePdfTotal[] = [];
  let totalsNote: string | null = null;
  if (data.money) {
    const charged = pieces.filter((p) => !isClosedStatus(p.status));
    const t = igvTotals(
      charged.map((p) => p.priceCents ?? 0),
      data.money.pricesIncludeIgv,
    );
    totals.push(
      { label: "Op. gravada", value: formatCents(t.taxableBase) },
      { label: "IGV (18 %)", value: formatCents(t.igv) },
      { label: "Total", value: formatCents(t.total), strong: true },
    );
    // A cuenta de toda la guía: solo si se exportan todas sus piezas.
    if (pieces.length === data.pieces.length) {
      totals.push(
        { label: "A cuenta", value: formatCents(data.money.paidCents) },
        {
          label: "Saldo",
          value: formatCents(
            Math.max(data.money.totalCents - data.money.paidCents, 0),
          ),
          strong: true,
        },
      );
    }
    if (charged.some((p) => p.priceCents === null))
      totalsNote = "Hay piezas sin precio (por definir).";
  }

  const contact = [company.phones, company.email]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

  return {
    title: "GUÍA DE RESTAURACIÓN",
    code: data.code,
    companyLines: [
      company.name,
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
      ["Impreso", formatDate(now)],
    ],
    client: [
      data.clientName,
      data.contactName ? `Contacto: ${data.contactName}` : "",
      data.phone ? `Teléfono: ${data.phone}` : "",
    ].filter(Boolean),
    guide: [
      ["Estado", RESTORATION_STATUS_LABELS[data.status]],
      ["Tipo de pago", PAYMENT_TYPE_LABELS[data.paymentType]],
      ...(data.money
        ? ([["Precios", igvLabel(data.money.pricesIncludeIgv)]] as [
            string,
            string,
          ][])
        : []),
      ["Piezas", `${pieces.length} de ${data.pieces.length}`],
      ...(data.shopifyOrderName
        ? ([["Orden", data.shopifyOrderName]] as [string, string][])
        : []),
    ],
    showPrice,
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
    footer: contact
      ? `Si tiene alguna pregunta sobre esta guía, comuníquese con nosotros: ${contact}`
      : "Si tiene alguna pregunta sobre esta guía, comuníquese con nosotros.",
  };
}
