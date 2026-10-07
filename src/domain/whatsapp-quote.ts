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
 * Mensaje de cotización por WhatsApp (Todo.md §8 Paso 7.5). P25 sigue pendiente:
 * se usa su propuesta (una línea numerada por pieza "descripción – servicio:
 * S/ precio" y una línea de forma de pago con el adelanto).
 */

export type QuotePiece = {
  description: string;
  /** Nombre del servicio (del catálogo o texto libre); puede faltar. */
  service: string | null;
  priceCents: Cents;
  status: PieceStatus;
};

export type QuoteMessageData = {
  /** Código de la restauración (RES-00001) o de la cotización de WhatsApp (CWA-00001). */
  code: string;
  /** Vacío si la cotización no tiene cliente ni nombre: el saludo queda genérico (P46). */
  clientName: string;
  /** Contacto de la restauración; si hay, el saludo va a su nombre. */
  contactName?: string | null;
  /** En el orden en que se muestran; las anuladas, rechazadas y sin arreglo se omiten. */
  pieces: readonly QuotePiece[];
  paymentType: PaymentType;
  /** % de adelanto; solo se usa "A cuenta". */
  depositPercent: number;
  /** Términos y condiciones de la configuración. */
  terms: string;
};

/** Monto sin el símbolo, porque la plantilla ya escribe "S/ " delante: "1,234.50". */
function amount(cents: Cents): string {
  return formatCents(cents).replace(/^S\/\s*/, "");
}

function percent(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** Total y adelanto de la cotización, sin las piezas que no se cobran. */
export function quoteAmounts(
  data: Pick<QuoteMessageData, "pieces" | "paymentType" | "depositPercent">,
): { totalCents: Cents; depositCents: Cents } {
  const totalCents = sumCents(
    data.pieces
      .filter((p) => !isClosedStatus(p.status))
      .map((p) => p.priceCents),
  );
  return {
    totalCents,
    depositCents: expectedDeposit(
      totalCents,
      data.paymentType,
      data.depositPercent,
    ),
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
      return `Forma de pago: ${label} (adelanto del ${percent(depositPercent)} %: S/ ${amount(depositCents)})`;
    case "credito":
      return `Forma de pago: ${label} (sin adelanto)`;
  }
}

/** Valores de cada variable de la plantilla para una restauración. */
export function quoteValues(
  data: QuoteMessageData,
): Record<WhatsAppPlaceholder, string> {
  const { totalCents, depositCents } = quoteAmounts(data);
  const piezas = data.pieces
    .filter((p) => !isClosedStatus(p.status))
    .map((p, i) => {
      const service = p.service?.trim();
      const name = service
        ? `${p.description.trim()} – ${service}`
        : p.description.trim();
      return `${i + 1}. ${name}: S/ ${amount(p.priceCents)}`;
    })
    .join("\n");
  return {
    cliente: (data.contactName?.trim() || data.clientName).trim(),
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

/** Arma el mensaje con la plantilla de la configuración (`settings.whatsappTemplate`). */
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
