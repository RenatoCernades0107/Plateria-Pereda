import type { Json } from "@/lib/supabase/database.types";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import type { ShopifyGateway } from "@/server/shopify/gateway";
import type { CustomerInput } from "@/server/shopify/types";
import type { ShopifyJobHandler } from "@/server/shopify-sync/handlers";

export type ClientRecord = {
  id: string;
  kind: "persona" | "empresa";
  firstName: string;
  lastName: string;
  legalName: string;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string;
  city: string;
  region: string | null;
  shopifyCustomerId: string | null;
  shopifyCompanyId: string | null;
  shopifyCompanyLocationId: string | null;
};

export type ContactRecord = {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  shopifyCustomerId: string | null;
  shopifyCompanyContactId: string | null;
};

/** Lectura y escritura de clientes para los handlers (con la clave secreta). */
export interface ClientSyncRepository {
  getClient(id: string): Promise<ClientRecord | null>;
  setClientShopifyIds(
    id: string,
    ids: Partial<
      Pick<
        ClientRecord,
        "shopifyCustomerId" | "shopifyCompanyId" | "shopifyCompanyLocationId"
      >
    >,
  ): Promise<void>;
  getContact(id: string): Promise<ContactRecord | null>;
  setContactShopifyIds(
    id: string,
    ids: Pick<ContactRecord, "shopifyCustomerId" | "shopifyCompanyContactId">,
  ): Promise<void>;
}

/** Campo que Shopify dice que ya está en uso (email o teléfono), si es ese el error. */
export function takenField(error: unknown): "email" | "phone" | null {
  if (!(error instanceof ShopifyUserError)) return null;
  for (const f of error.fields) {
    if (!/already been taken/i.test(f.message)) continue;
    const field = f.field?.at(-1);
    if (field === "email" || field === "phone") return field;
  }
  return null;
}

/** Busca el cliente de Shopify que ya usa ese email o teléfono. */
async function findExistingCustomer(
  gateway: ShopifyGateway,
  field: "email" | "phone",
  value: string | null,
) {
  if (!value) return null;
  const page = await gateway.searchCustomers(`${field}:${value}`, { first: 1 });
  return page.items[0] ?? null;
}

const NOTE =
  "Registrado desde el sistema de restauraciones de Platería Pereda.";

function personInput(client: ClientRecord): CustomerInput {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    note: NOTE,
  };
}

/**
 * Handlers del outbox para clientes (Paso 6.2). Son idempotentes: si el registro ya
 * tiene su id de Shopify no lo vuelven a crear, y si Shopify dice que el email o el
 * teléfono ya existe, vinculan el cliente existente en vez de duplicarlo.
 */
export function clientJobHandlers(
  repo: ClientSyncRepository,
): Record<string, ShopifyJobHandler> {
  return {
    "customer.create": async (job, gateway) => {
      const client = await repo.getClient(job.entityId);
      if (!client)
        throw new ShopifyUserError([
          { field: null, message: "El cliente ya no existe" },
        ]);
      if (client.shopifyCustomerId)
        return { shopifyCustomerId: client.shopifyCustomerId };

      let customerId: string;
      let linked = false;
      try {
        customerId = (await gateway.createCustomer(personInput(client))).id;
      } catch (error) {
        const field = takenField(error);
        const existing =
          field && (await findExistingCustomer(gateway, field, client[field]));
        if (!existing) throw error;
        customerId = existing.id;
        linked = true;
      }
      await repo.setClientShopifyIds(client.id, {
        shopifyCustomerId: customerId,
      });
      return { shopifyCustomerId: customerId, linked } satisfies Json;
    },

    "company.create": async (job, gateway) => {
      const client = await repo.getClient(job.entityId);
      if (!client)
        throw new ShopifyUserError([
          { field: null, message: "El cliente ya no existe" },
        ]);
      if (client.shopifyCompanyId)
        return { shopifyCompanyId: client.shopifyCompanyId };

      const company = await gateway.createCompany({
        name: client.legalName,
        externalId: client.documentNumber ?? "",
        phone: client.phone,
        address: {
          address1: client.address || client.legalName,
          city: client.city || "Lima",
          zoneCode: client.region || "LIM",
        },
      });
      await repo.setClientShopifyIds(client.id, {
        shopifyCompanyId: company.id,
        shopifyCompanyLocationId: company.locationId,
      });
      return {
        shopifyCompanyId: company.id,
        shopifyCompanyLocationId: company.locationId,
      };
    },

    "contact.create": async (job, gateway) => {
      const contact = await repo.getContact(job.entityId);
      if (!contact)
        throw new ShopifyUserError([
          { field: null, message: "El contacto ya no existe" },
        ]);
      if (contact.shopifyCompanyContactId) {
        return { shopifyCompanyContactId: contact.shopifyCompanyContactId };
      }
      const company = await repo.getClient(contact.clientId);
      if (!company?.shopifyCompanyId) {
        // Se reintenta: la empresa se sincroniza primero.
        throw new ShopifyUnavailableError("La empresa aún no está en Shopify");
      }

      let result;
      let linked = false;
      try {
        result = await gateway.createCompanyContact(company.shopifyCompanyId, {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
        });
      } catch (error) {
        const field = takenField(error);
        const existing =
          field && (await findExistingCustomer(gateway, field, contact[field]));
        if (!existing) throw error;
        result = await gateway.assignCustomerAsContact(
          company.shopifyCompanyId,
          existing.id,
        );
        linked = true;
      }
      await repo.setContactShopifyIds(contact.id, {
        shopifyCustomerId: result.customerId,
        shopifyCompanyContactId: result.id,
      });
      return {
        shopifyCustomerId: result.customerId,
        shopifyCompanyContactId: result.id,
        linked,
      };
    },
  };
}
