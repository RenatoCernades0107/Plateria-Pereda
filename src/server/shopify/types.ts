/**
 * Tipos del dominio para hablar con Shopify. Los montos son textos decimales
 * ("200.00"), como los usa Shopify, para no perder céntimos con números flotantes.
 */

export type Money = string;

export type Page<T> = {
  items: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export type PageOptions = { first?: number; after?: string | null };

export type ShopifyCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  note: string;
  updatedAt: string;
};

export type CustomerInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  /** En formato E.164 (+51999888777). */
  phone?: string | null;
  note?: string;
};

/** Dirección peruana de la ubicación de una empresa (Perú exige la región, spike 4.1). */
export type CompanyAddress = {
  address1: string;
  city: string;
  /** Código de región de Shopify, p. ej. "LIM". */
  zoneCode: string;
};

export type CompanyInput = {
  /** Razón social. */
  name: string;
  /** RUC (se guarda como externalId de la Company). */
  externalId: string;
  phone?: string | null;
  address: CompanyAddress;
  /** Primer contacto, si ya se conoce. */
  contact?: CustomerInput;
};

export type ShopifyCompanyContact = {
  /** Id del CompanyContact. */
  id: string;
  /** Id del Customer que representa al contacto. */
  customerId: string;
};

export type ShopifyCompany = {
  id: string;
  name: string;
  externalId: string | null;
  locationId: string;
  contacts: ShopifyCompanyContact[];
};

export type ShopifyProductSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  minPrice: Money;
  maxPrice: Money;
};

export type ShopifyVariant = {
  id: string;
  title: string;
  price: Money;
  sku: string | null;
  imageUrl: string | null;
};

export type ShopifyProduct = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  variants: ShopifyVariant[];
};

/** Línea personalizada (sin producto del catálogo), p. ej. "Restauración RES-00001-1". */
export type CustomLine = { title: string; price: Money; quantity: number };

export type PaymentInput = { amount: Money; gateway: string };

export type OrderInput = {
  /** Cliente (persona o contacto de la empresa) que hace el pedido. */
  customerId: string;
  /** Ubicación de la Company cuando la orden es a nombre de una empresa (P14). */
  companyLocationId?: string;
  lines: CustomLine[];
  /**
   * Incluye el código de la restauración. Shopify no evita duplicar órdenes con
   * @idempotent (spike 4.1): antes de reintentar se busca la orden por esta etiqueta.
   */
  tags: string[];
  note?: string;
  /** Pagos que la orden ya trae al crearse (p. ej., el adelanto). */
  payments?: PaymentInput[];
};

export type RefundInput = PaymentInput & {
  /** Clave estable del reembolso; Shopify la exige en 2026-10. */
  idempotencyKey: string;
  note?: string;
};

export type ShopifyOrderLine = {
  id: string;
  title: string;
  price: Money;
  quantity: number;
  fulfilled: boolean;
};

export type ShopifyOrder = {
  id: string;
  name: string;
  tags: string[];
  lines: ShopifyOrderLine[];
};

export type FinancialStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOIDED"
  | "EXPIRED";

export type OrderFinancials = {
  id: string;
  name: string;
  financialStatus: FinancialStatus;
  total: Money;
  received: Money;
  outstanding: Money;
};

export type OrderEdit = {
  addLines?: CustomLine[];
  removeLineIds?: string[];
  setPrices?: { lineId: string; price: Money }[];
};
