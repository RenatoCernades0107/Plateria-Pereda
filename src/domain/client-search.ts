import type { DocumentType } from "./documents";

/** Una opción del buscador de clientes: del sistema o solo de Shopify. */
export type ClientOption =
  | {
      source: "local";
      kind: "persona" | "empresa";
      clientId: string;
      name: string;
      documentType: DocumentType | null;
      documentNumber: string | null;
      phone: string | null;
      email: string | null;
      shopifyCustomerId: string | null;
    }
  | {
      source: "local";
      kind: "contacto";
      clientId: string;
      contactId: string;
      name: string;
      /** Empresa a la que pertenece el contacto. */
      companyName: string;
      phone: string | null;
      email: string | null;
      shopifyCustomerId: string | null;
    }
  | {
      source: "shopify";
      kind: "persona";
      shopifyCustomerId: string;
      name: string;
      phone: string | null;
      email: string | null;
    };

export function optionKey(option: ClientOption): string {
  if (option.source === "shopify") return `shopify:${option.shopifyCustomerId}`;
  return option.kind === "contacto"
    ? `contact:${option.contactId}`
    : `client:${option.clientId}`;
}

/**
 * Une los resultados del sistema y de Shopify: un cliente de Shopify que ya está en
 * el sistema (por su id, email o teléfono) no se repite.
 */
export function mergeClientOptions(
  local: ClientOption[],
  shopify: ClientOption[],
): ClientOption[] {
  const ids = new Set(local.map((o) => o.shopifyCustomerId).filter(Boolean));
  const emails = new Set(local.map((o) => o.email).filter(Boolean));
  const phones = new Set(local.map((o) => o.phone).filter(Boolean));
  const fromShopify = shopify.filter(
    (o) =>
      !ids.has(o.shopifyCustomerId) &&
      !(o.email && emails.has(o.email)) &&
      !(o.phone && phones.has(o.phone)),
  );
  return [...local, ...fromShopify];
}

/**
 * Prepara el texto de búsqueda: quita los caracteres que rompen el filtro de la API y
 * extrae los dígitos para buscar teléfonos y documentos.
 */
export function parseClientQuery(query: string) {
  const text = query
    .replace(/[,()*%\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const digits = text.replace(/\D/g, "");
  return { text, digits, searchable: text.length >= 2 };
}
