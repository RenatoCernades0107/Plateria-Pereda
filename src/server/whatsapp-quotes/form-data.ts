import "server-only";

import type { QuoteForForm } from "@/components/restorations/restoration-form";
import { formatCents, toDecimalString } from "@/domain/money";

import type { WhatsappQuoteDetail } from "./queries";

/** Cotización en el formato del formulario (editarla o pedir sus piezas, P46). */
export function quoteForForm(quote: WhatsappQuoteDetail): QuoteForForm {
  return {
    id: quote.id,
    code: quote.code,
    client: quote.client
      ? {
          source: "local",
          kind: quote.client.kind,
          clientId: quote.client.id,
          name: quote.client.name,
          documentType: null,
          documentNumber: null,
          phone: quote.client.phone,
          email: null,
          shopifyCustomerId: null,
        }
      : null,
    contactId: quote.contact?.id ?? null,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    paymentType: quote.paymentType,
    depositPercent: quote.depositPercent,
    notes: quote.notes,
    items: quote.items.map((item) => ({
      id: item.id,
      number: item.number,
      priceLabel: formatCents(item.priceCents),
      orderedIn: item.order?.restorationCode ?? null,
      piece: {
        workshopId: null,
        description: item.description,
        measure: item.measure,
        material: { id: item.materialId, name: item.materialName },
        service: { id: item.serviceId, name: item.serviceName },
        weight: item.weightGrams === null ? "" : String(item.weightGrams),
        price: toDecimalString(item.priceCents),
        urgent: false,
        notes: item.notes,
        quoteItemId: null,
      },
    })),
  };
}
