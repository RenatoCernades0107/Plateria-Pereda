import {
  expectedDeposit,
  formatCents,
  PAYMENT_TYPE_LABELS,
  sumCents,
  type Cents,
  type PaymentType,
} from "./money";
import { normalizePhone } from "./phone";
import { isClosedStatus, type PieceStatus } from "./piece-state-machine";
import {
  renderWhatsAppTemplate,
  type WhatsAppPlaceholder,
} from "./whatsapp-template";

/**
 * Mensaje de cotización por WhatsApp (Todo.md §8 Paso 7.5). Cada pieza es un bloque
 * separado por una línea en blanco: el número y la descripción en negrita, un
 * servicio por línea ("▸") y el precio en negrita en su propia línea. Con cantidad
 * mayor que 1 la descripción lleva "(x2)"; el precio es de la pieza completa (no se
 * multiplica).
 */

export type QuotePiece = {
  description: string;
  /** Unidades (informativa): con más de una, el mensaje dice "x2". El precio es de la pieza completa. */
  quantity?: number;
  /** Nombre del servicio (del catálogo o texto libre); puede faltar. */
  service: string | null;
  /**
   * Servicios del catálogo, en orden: cada uno va en su línea. Sin ellos se usa
   * `service` tal cual (los nombres pueden llevar comas, así que no se separa).
   */
  services?: readonly string[];
  /** null: precio de venta sin asignar (D58); el mensaje dice "por definir" y suma 0. */
  priceCents: Cents | null;
  status: PieceStatus;
};

export type QuoteMessageData = {
  /** Código de la restauración (RES-00001) o de la cotización de WhatsApp (CWA-00001). */
  code: string;
  /** Vacío si la cotización no tiene cliente ni nombre: el saludo queda genérico (P46). */
  clientName: string;
  /** Contacto de la restauración; si hay, el saludo va a su nombre. */
  contactName?: string | null;
  /** Teléfono del cliente (ya con formato); vacío si no hay. */
  clientPhone?: string | null;
  /** Número de documento del cliente (DNI, RUC…); vacío si no tiene. */
  clientDocument?: string | null;
  /** En el orden en que se muestran; las anuladas, rechazadas y sin arreglo se omiten. */
  pieces: readonly QuotePiece[];
  paymentType: PaymentType;
  /** % de adelanto; solo se usa "A cuenta". */
  depositPercent: number;
  /** Términos y condiciones de la configuración. */
  terms: string;
  /**
   * Las piezas ya vienen elegidas a mano (diálogo del detalle): se incluyen todas,
   * aunque estén cerradas.
   */
  includeClosed?: boolean;
  /**
   * Formato de `{piezas}`: el de la guía (negrita, servicios y precio) o el
   * referencial de las cotizaciones de WhatsApp (nombre, cantidad y precio aproximado).
   */
  pieceStyle?: "guia" | "referencial";
};

/** Piezas que entran en el mensaje: sin las que no se cobran, salvo elegidas a mano. */
function chargedPieces(
  data: Pick<QuoteMessageData, "pieces" | "includeClosed">,
): readonly QuotePiece[] {
  return data.includeClosed
    ? data.pieces
    : data.pieces.filter((p) => !isClosedStatus(p.status));
}

/**
 * Piezas marcadas por defecto al elegir qué va en el mensaje: todas menos las
 * anuladas y rechazadas (ni las que no tienen arreglo, que tampoco se cobran).
 */
export function isQuoteSelectedByDefault(status: PieceStatus): boolean {
  return !isClosedStatus(status);
}

/** Monto sin el símbolo, porque la plantilla ya escribe "S/ " delante: "1,234.50". */
function amount(cents: Cents): string {
  return formatCents(cents).replace(/^S\/\s*/, "");
}

function percent(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** Total y adelanto de la cotización, sin las piezas que no se cobran. */
export function quoteAmounts(
  data: Pick<
    QuoteMessageData,
    "pieces" | "paymentType" | "depositPercent" | "includeClosed"
  >,
): {
  totalCents: Cents;
  depositCents: Cents;
} {
  const total = sumCents(chargedPieces(data).map((p) => p.priceCents ?? 0));
  return {
    totalCents: total,
    depositCents: expectedDeposit(total, data.paymentType, data.depositPercent),
  };
}

function paymentLine(
  paymentType: PaymentType,
  depositPercent: number,
  depositCents: Cents,
): string {
  const label = PAYMENT_TYPE_LABELS[paymentType];
  switch (paymentType) {
    case "contado":
      return `Forma de pago: ${label} (S/ ${amount(depositCents)})`;
    case "a_cuenta":
      if (!depositPercent) return `Forma de pago: ${label} (sin adelanto)`;
      return `Forma de pago: ${label} (adelanto del ${percent(depositPercent)} %: S/ ${amount(depositCents)})`;
    case "credito":
      return `Forma de pago: ${label} (sin adelanto)`;
    case "sin_definir":
      return `Forma de pago: ${label}`;
  }
}

/** Sangría de las líneas de servicio y precio bajo el nombre de la pieza. */
const INDENT = "     ";

/** Paréntesis largo al final de la descripción: va fuera de la negrita. */
const LONG_DETAIL = /^(.+?)\s+(\([^()]{25,}\))$/;

/**
 * Bloque de una pieza:
 *   *1. Juego de té* (tetera, azucarero y lechera)
 *        ▸ Limpieza profunda
 *        *S/ 1,300.00*
 */
function pieceBlock(p: QuotePiece, number: number): string {
  const quantity = p.quantity && p.quantity > 1 ? ` (x${p.quantity})` : "";
  const description = p.description.trim();
  const detail = LONG_DETAIL.exec(description);
  const title = detail
    ? `*${number}. ${detail[1]}${quantity}* ${detail[2]}`
    : `*${number}. ${description}${quantity}*`;
  const services = (p.services?.length ? p.services : [p.service ?? ""])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${INDENT}▸ ${s}`);
  const price =
    p.priceCents === null
      ? `${INDENT}*Precio por definir*`
      : `${INDENT}*S/ ${amount(p.priceCents)}*`;
  return [title, ...services, price].join("\n");
}

/**
 * Bloque de una pieza en la cotización referencial de WhatsApp:
 *   1. Juego de té
 *   Cantidad: 1 unidad
 *   Precio aproximado: S/ 1,300.00
 */
function referencePieceBlock(p: QuotePiece, number: number): string {
  const quantity = p.quantity && p.quantity > 0 ? p.quantity : 1;
  const price =
    p.priceCents === null ? "por definir" : `S/ ${amount(p.priceCents)}`;
  return [
    `${number}. ${p.description.trim()}`,
    `Cantidad: ${quantity} ${quantity === 1 ? "unidad" : "unidades"}`,
    `Precio aproximado: ${price}`,
  ].join("\n");
}

/** Valores de cada variable de la plantilla para una restauración. */
export function quoteValues(
  data: QuoteMessageData,
): Record<WhatsAppPlaceholder, string> {
  const { totalCents, depositCents } = quoteAmounts(data);
  const block =
    data.pieceStyle === "referencial" ? referencePieceBlock : pieceBlock;
  const piezas = chargedPieces(data)
    .map((p, i) => block(p, i + 1))
    .join("\n\n");
  return {
    cliente: (data.contactName?.trim() || data.clientName).trim(),
    telefono: data.clientPhone?.trim() ?? "",
    dni: data.clientDocument?.trim() ?? "",
    codigo: data.code,
    piezas,
    total: amount(totalCents),
    tipo_pago: PAYMENT_TYPE_LABELS[data.paymentType],
    forma_pago: paymentLine(
      data.paymentType,
      data.depositPercent,
      depositCents,
    ),
    porcentaje_adelanto:
      data.paymentType === "a_cuenta" ? percent(data.depositPercent) : "0",
    adelanto: amount(depositCents),
    condiciones: data.terms.trim(),
  };
}

/**
 * Arma el mensaje con una plantilla de la configuración: `settings.whatsappTemplate`
 * (guías) o `settings.whatsappQuoteTemplate` (cotizaciones de WhatsApp).
 */
export function buildQuoteMessage(
  template: string,
  data: QuoteMessageData,
): string {
  const text = renderWhatsAppTemplate(template, quoteValues(data));
  // Sin nombre, "Hola {cliente}, …" queda "Hola, …" (saludo genérico, P46).
  return text.replace(/^(Hola)\s+,/, "$1,");
}

/**
 * Enlace para abrir WhatsApp con el mensaje escrito:
 * `https://wa.me/51999888777?text=...`. Null si no hay un teléfono válido.
 */
export function whatsappUrl(
  phone: string | null | undefined,
  text: string,
): string | null {
  const e164 = phone ? normalizePhone(phone) : null;
  if (!e164) return null;
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}
