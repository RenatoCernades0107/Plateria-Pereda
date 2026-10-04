import {
  personFromShopify,
  type ShopifyCustomerData,
} from "@/domain/shopify-customer";
import type { ShopifyGateway } from "@/server/shopify/gateway";

export const IMPORT_OUTCOMES = [
  "created",
  "linked",
  "updated",
  "unchanged",
  "contact",
] as const;
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number];

export type ImportCustomerInput = ShopifyCustomerData & {
  customerId: string;
  /** Nombre a usar si Shopify no tiene nombres. */
  fallbackName: string;
};

/** Guarda un cliente de Shopify (función `import_shopify_customer` de la BD). */
export type ImportCustomer = (
  input: ImportCustomerInput,
) => Promise<ImportOutcome>;

export type ImportSummary = Record<ImportOutcome, number> & {
  failed: number;
  errors: { customerId: string; message: string }[];
  /** Cursor para continuar si se cortó por tiempo; null si terminó. */
  nextCursor: string | null;
};

const MAX_ERRORS = 20;

/**
 * Pagina los clientes de Shopify y los guarda en el sistema. Es idempotente: volver a
 * ejecutarla no duplica. Un cliente que falla no detiene la importación. Si
 * `deadline` llega, se detiene al final de la página y devuelve el cursor para seguir.
 */
export async function importShopifyCustomers({
  gateway,
  importCustomer,
  after = null,
  pageSize = 100,
  deadline = Number.POSITIVE_INFINITY,
  now = Date.now,
}: {
  gateway: ShopifyGateway;
  importCustomer: ImportCustomer;
  after?: string | null;
  pageSize?: number;
  deadline?: number;
  now?: () => number;
}): Promise<ImportSummary> {
  const summary: ImportSummary = {
    created: 0,
    linked: 0,
    updated: 0,
    unchanged: 0,
    contact: 0,
    failed: 0,
    errors: [],
    nextCursor: null,
  };

  let cursor = after;
  for (;;) {
    const page = await gateway.searchCustomers("", {
      first: pageSize,
      after: cursor,
    });
    for (const customer of page.items) {
      const person = personFromShopify(customer);
      try {
        const outcome = await importCustomer({
          customerId: customer.id,
          firstName: customer.firstName.trim().replace(/\s+/g, " "),
          lastName: customer.lastName.trim().replace(/\s+/g, " "),
          email: person.email,
          phone: person.phone,
          note: person.notes,
          fallbackName: person.firstName,
        });
        summary[outcome] += 1;
      } catch (error) {
        summary.failed += 1;
        if (summary.errors.length < MAX_ERRORS) {
          summary.errors.push({
            customerId: customer.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    if (!page.pageInfo.hasNextPage) return summary;
    cursor = page.pageInfo.endCursor;
    if (now() >= deadline) {
      summary.nextCursor = cursor;
      return summary;
    }
  }
}
