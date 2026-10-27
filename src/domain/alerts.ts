import type { AppRole } from "@/lib/roles";

import { renderTemplate, unknownTemplatePlaceholders } from "./template";

/**
 * Alertas de la campana (D76). La BD decide quién recibe cada una (disparador
 * `notify_piece_status`) y guarda los contadores; aquí se arma el mensaje al leerlo,
 * con la plantilla vigente de Configuración → Alertas.
 */

export const ALERT_KINDS = [
  "aprobacion_parcial",
  "aprobacion_total",
  "pieza_en_espera",
  "guia_en_espera",
  "guia_lista",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Roles que reciben cada alerta (igual que `private.alert_roles` de la BD). */
export const ALERT_ROLES: Record<AlertKind, readonly AppRole[]> = {
  aprobacion_parcial: ["admin", "logistica"],
  aprobacion_total: ["admin", "logistica"],
  pieza_en_espera: ["admin", "ventas"],
  guia_en_espera: ["admin", "ventas"],
  guia_lista: ["admin", "ventas"],
};

export const ALERT_LABELS: Record<AlertKind, string> = {
  aprobacion_parcial: "Guía parcialmente aprobada",
  aprobacion_total: "Guía aprobada",
  pieza_en_espera: "Pieza en espera del cliente",
  guia_en_espera: "Guía en espera del cliente",
  guia_lista: "Guía lista para entregar",
};

export const ALERT_DESCRIPTIONS: Record<AlertKind, string> = {
  aprobacion_parcial:
    "Se aprueban piezas de una guía y todavía faltan otras por decidir.",
  aprobacion_total: "Se aprueba la última pieza de la guía.",
  pieza_en_espera: "Una o más piezas pasan a «Espera respuesta cliente».",
  guia_en_espera:
    "Todas las piezas de la guía quedan esperando la respuesta del cliente. Quien la recibe no recibe además la de pieza en espera.",
  guia_lista:
    "Todas las piezas de la guía ya volvieron del taller (o se entregaron): es hora de avisarle al cliente.",
};

/** Grupos de la pantalla de configuración. */
export const ALERT_GROUPS: readonly {
  title: string;
  description: string;
  kinds: readonly AlertKind[];
}[] = [
  {
    title: "Aprobación de guías",
    description: "Para que logística sepa qué piezas ya pueden ir al taller.",
    kinds: ["aprobacion_parcial", "aprobacion_total"],
  },
  {
    title: "Espera de respuesta del cliente",
    description: "Para que ventas haga seguimiento al cliente.",
    kinds: ["pieza_en_espera", "guia_en_espera"],
  },
  {
    title: "Guía lista para entregar",
    description: "Para avisarle al cliente que ya puede recoger su pedido.",
    kinds: ["guia_lista"],
  },
];

/** Variables que se pueden usar en el mensaje de las alertas. */
export const ALERT_PLACEHOLDERS = {
  guia: "Código de la guía (RES-00001)",
  cliente: "Nombre del cliente («el cliente» para logística, que no lo ve)",
  piezas: "Piezas del cambio, con su código y descripción",
  cantidad: "Cuántas piezas cambiaron",
  aprobadas: "Piezas aprobadas de la guía",
  pendientes: "Piezas de la guía que faltan aprobar",
  en_espera: "Piezas de la guía en espera del cliente",
  total: "Piezas de la guía (sin las anuladas, rechazadas ni sin arreglo)",
  usuario: "Quién hizo el cambio",
} as const;
export type AlertPlaceholder = keyof typeof ALERT_PLACEHOLDERS;

export const DEFAULT_ALERT_TEMPLATES: Record<AlertKind, string> = {
  aprobacion_parcial:
    "{usuario} aprobó {piezas}. Van {aprobadas} de {total} piezas aprobadas; faltan {pendientes} por decidir.",
  aprobacion_total:
    "{usuario} aprobó {piezas}. Guía completa: {aprobadas} de {total} piezas aprobadas, listas para ir al taller.",
  pieza_en_espera:
    "{usuario} pasó {piezas} a esperar la respuesta de {cliente}. En espera: {en_espera} de {total} piezas de la guía.",
  guia_en_espera:
    "Todas las piezas de la guía ({total}) esperan la respuesta de {cliente}. Es buen momento para hacerle seguimiento.",
  guia_lista:
    "La guía quedó lista: las {total} piezas ya volvieron y se pueden entregar a {cliente} (últimas en volver: {piezas}). Avísale para que las recoja.",
};

export const ALERT_TEMPLATE_MAX = 1000;

/** Variables escritas en el mensaje que no existen (p. ej., "{guai}"). */
export function unknownAlertPlaceholders(template: string): string[] {
  return unknownTemplatePlaceholders(template, ALERT_PLACEHOLDERS);
}

export type AlertPiece = { code: string; description: string };

const DESCRIPTION_MAX = 40;
const PIECES_MAX = 3;

function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > DESCRIPTION_MAX
    ? `${clean.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
    : clean;
}

/** "RES-00001-1 (Fuente), RES-00001-2 (Jarra) y 3 más". */
export function formatAlertPieces(
  pieces: readonly AlertPiece[],
  max = PIECES_MAX,
): string {
  const shown = pieces.slice(0, max).map((p) => {
    const description = shorten(p.description);
    return description ? `${p.code} (${description})` : p.code;
  });
  const rest = pieces.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} y ${rest} más`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} y ${shown.at(-1)}`;
}

/** Contadores de la guía al generarse la alerta (columna `data`). */
export type AlertCounts = { live: number; approved: number; waiting: number };

export function toAlertCounts(data: unknown): AlertCounts {
  const value = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  return {
    live: num(value.live),
    approved: num(value.approved),
    waiting: num(value.waiting),
  };
}

export type AlertInput = {
  kind: AlertKind;
  restorationCode: string;
  /** null si quien la lee no ve al cliente (logística). */
  clientName: string | null;
  actorName: string | null;
  counts: AlertCounts;
  pieces: readonly AlertPiece[];
};

/** Valores de las variables para una alerta. */
export function alertValues(
  input: Omit<AlertInput, "kind">,
): Record<AlertPlaceholder, string> {
  const { counts } = input;
  return {
    guia: input.restorationCode,
    cliente: input.clientName?.trim() || "el cliente",
    piezas: formatAlertPieces(input.pieces) || "piezas",
    cantidad: String(input.pieces.length),
    aprobadas: String(counts.approved),
    pendientes: String(Math.max(counts.live - counts.approved, 0)),
    en_espera: String(counts.waiting),
    total: String(counts.live),
    usuario: input.actorName?.trim() || "Alguien",
  };
}

/** Título y mensaje de la alerta; sin plantilla propia se usa la de la aplicación. */
export function renderAlert(
  input: AlertInput,
  template: string | null | undefined,
): { title: string; body: string } {
  const body = renderTemplate(
    template?.trim() || DEFAULT_ALERT_TEMPLATES[input.kind],
    ALERT_PLACEHOLDERS,
    alertValues(input),
  )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return {
    title: `${input.restorationCode} · ${ALERT_LABELS[input.kind]}`,
    body,
  };
}

/** Datos de ejemplo para la vista previa en Configuración. */
export const ALERT_PREVIEW: Record<AlertKind, Omit<AlertInput, "kind">> = {
  aprobacion_parcial: {
    restorationCode: "RES-00123",
    clientName: "María Pérez",
    actorName: "Vera (ventas)",
    counts: { live: 4, approved: 2, waiting: 1 },
    pieces: [
      { code: "RES-00123-1", description: "Fuente de plata" },
      { code: "RES-00123-2", description: "Jarra" },
    ],
  },
  aprobacion_total: {
    restorationCode: "RES-00123",
    clientName: "María Pérez",
    actorName: "Vera (ventas)",
    counts: { live: 4, approved: 4, waiting: 0 },
    pieces: [{ code: "RES-00123-4", description: "Bandeja" }],
  },
  pieza_en_espera: {
    restorationCode: "RES-00124",
    clientName: "Juan Rojas",
    actorName: "Lalo (logística)",
    counts: { live: 3, approved: 0, waiting: 1 },
    pieces: [{ code: "RES-00124-1", description: "Candelabro" }],
  },
  guia_en_espera: {
    restorationCode: "RES-00124",
    clientName: "Juan Rojas",
    actorName: "Lalo (logística)",
    counts: { live: 3, approved: 0, waiting: 3 },
    pieces: [{ code: "RES-00124-3", description: "Azucarera" }],
  },
  guia_lista: {
    restorationCode: "RES-00125",
    clientName: "Lucía Torres",
    actorName: "Lalo (logística)",
    counts: { live: 3, approved: 3, waiting: 0 },
    pieces: [{ code: "RES-00125-3", description: "Bandeja" }],
  },
};
