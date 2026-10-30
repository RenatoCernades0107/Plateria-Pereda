import type { DocumentType } from "./documents";

/**
 * Clientes duplicados (pedido del 2026-10-30): aviso al registrar uno que se parece a
 * otro y resumen de la fusión de dos personas (`similar_clients` y `merge_clients`).
 */

export type DuplicateReason = "documento" | "telefono" | "email" | "nombre";

export type SimilarClient = {
  id: string;
  kind: "persona" | "empresa";
  name: string;
  documentType: DocumentType | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  reasons: DuplicateReason[];
};

const REASON_LABELS: Record<DuplicateReason, string> = {
  documento: "documento",
  telefono: "teléfono",
  email: "email",
  nombre: "nombre",
};

/** Fila de `similar_clients` → coincidencias en orden de importancia. */
export function duplicateReasons(row: {
  same_document: boolean;
  same_phone: boolean;
  same_email: boolean;
  same_name: boolean;
}): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  if (row.same_document) reasons.push("documento");
  if (row.same_phone) reasons.push("telefono");
  if (row.same_email) reasons.push("email");
  if (row.same_name) reasons.push("nombre");
  return reasons;
}

/** "Mismo teléfono y nombre". */
export function reasonsLabel(reasons: readonly DuplicateReason[]): string {
  const labels = reasons.map((r) => REASON_LABELS[r]);
  if (labels.length === 0) return "";
  const text =
    labels.length === 1
      ? labels[0]!
      : `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}`;
  return `Mismo ${text}`;
}

export type MergeCounts = {
  restorations: number;
  quotes: number;
  whatsappQuotes: number;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Se pasaron 2 guías y 1 cotización a Ana Díaz." */
export function mergeSummary(counts: MergeCounts, keptName: string): string {
  const parts = [
    counts.restorations > 0 && plural(counts.restorations, "guía", "guías"),
    counts.quotes > 0 && plural(counts.quotes, "cotización", "cotizaciones"),
    counts.whatsappQuotes > 0 &&
      plural(
        counts.whatsappQuotes,
        "cotización de WhatsApp",
        "cotizaciones de WhatsApp",
      ),
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) {
    return "Clientes fusionados: el duplicado no tenía guías ni cotizaciones y quedó desactivado.";
  }
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
  const total = counts.restorations + counts.quotes + counts.whatsappQuotes;
  const verb = total === 1 ? "Se pasó" : "Se pasaron";
  return `${verb} ${list} a ${keptName}. El duplicado quedó desactivado.`;
}
