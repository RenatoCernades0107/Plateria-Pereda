import type { Json } from "@/lib/supabase/database.types";
import {
  ShopifyNotFoundError,
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import type { ShopifyGateway } from "@/server/shopify/gateway";
import type { CompanyUpdate, CustomerInput } from "@/server/shopify/types";
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
  /** Cliente del sistema ya vinculado a ese Customer de Shopify, si hay. */
  findClientByShopifyCustomer(
    shopifyCustomerId: string,
  ): Promise<{ id: string; name: string } | null>;
  /** Si algún cliente o contacto del sistema usa ese Customer de Shopify. */
  isShopifyCustomerLinked(shopifyCustomerId: string): Promise<boolean>;
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

function companyData(client: ClientRecord): CompanyUpdate {
  return {
    name: client.legalName,
    externalId: client.documentNumber ?? "",
    phone: client.phone,
    address: {
      address1: client.address || client.legalName,
      city: client.city || "Lima",
      zoneCode: client.region || "LIM",
    },
  };
}

/**
 * Datos que se actualizan en el Customer. Un email o teléfono que se quitó en el
 * sistema no se borra en Shopify (se omite): ahí puede seguir sirviendo al cliente.
 */
function customerChanges(record: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}): Partial<CustomerInput> {
  return {
    firstName: record.firstName,
    lastName: record.lastName,
    ...(record.email && { email: record.email }),
    ...(record.phone && { phone: record.phone }),
  };
}

const gone = (what: string) =>
  new ShopifyUserError([{ field: null, message: `${what} ya no existe` }]);

/** El registro aún no tiene su id de Shopify: se reintenta cuando termine el alta. */
const notSyncedYet = (what: string) =>
  new ShopifyUnavailableError(`${what} aún no está en Shopify`);

/**
 * Handlers del outbox para clientes (Pasos 6.2 y 6.5). Son idempotentes: si el registro ya
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
      // Se convirtió en empresa antes de llegar a Shopify: su alta es la de la Company.
      if (client.kind !== "persona") return { skipped: true };

      let customerId: string;
      let linked = false;
      try {
        customerId = (await gateway.createCustomer(personInput(client))).id;
      } catch (error) {
        const field = takenField(error);
        const existing =
          field && (await findExistingCustomer(gateway, field, client[field]));
        if (!existing) throw error;
        // Ese Customer ya es de otro cliente del sistema: es un duplicado. Vincularlo
        // chocaría con la clave única; se avisa quién es para fusionarlos.
        const owner = await repo.findClientByShopifyCustomer(existing.id);
        if (owner && owner.id !== client.id) {
          throw new ShopifyUserError([
            {
              field: null,
              message: `Ya está registrado en el sistema como «${owner.name}» (mismo ${field === "phone" ? "teléfono" : "email"} en Shopify)`,
            },
          ]);
        }
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

      const company = await gateway.createCompany(companyData(client));
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
      if (!company?.shopifyCompanyId || !company.shopifyCompanyLocationId) {
        // Se reintenta: la empresa se sincroniza primero.
        throw new ShopifyUnavailableError("La empresa aún no está en Shopify");
      }

      const ref = {
        companyId: company.shopifyCompanyId,
        locationId: company.shopifyCompanyLocationId,
      };
      // La persona que se convirtió en esta empresa ya tiene su Customer: se asigna
      // ese en vez de crear otro.
      if (contact.shopifyCustomerId) {
        const result = await gateway.assignCustomerAsContact(
          ref,
          contact.shopifyCustomerId,
        );
        await repo.setContactShopifyIds(contact.id, {
          shopifyCustomerId: result.customerId,
          shopifyCompanyContactId: result.id,
        });
        return {
          shopifyCustomerId: result.customerId,
          shopifyCompanyContactId: result.id,
          linked: true,
        };
      }

      let result;
      let linked = false;
      try {
        result = await gateway.createCompanyContact(ref, {
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
        result = await gateway.assignCustomerAsContact(ref, existing.id);
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

    // Customer de una persona que se convirtió en empresa y no quedó de contacto: se
    // borra si nada lo usa. Que no se pueda borrar no es un error: queda en Shopify sin
    // vínculo (la importación lo ignora) y el job termina con el motivo.
    "customer.delete": async (job, gateway) => {
      const customerId = (job.payload as { customerId?: unknown } | null)
        ?.customerId;
      if (typeof customerId !== "string") {
        throw new ShopifyUserError([
          { field: null, message: "Falta el cliente de Shopify a borrar" },
        ]);
      }
      const notDeleted = (reason: string) => ({
        customerId,
        deleted: false,
        reason,
      });
      if (await repo.isShopifyCustomerLinked(customerId)) {
        return notDeleted("Está vinculado a un cliente o contacto del sistema");
      }
      const usage = await gateway.getCustomerUsage(customerId);
      if (!usage) return notDeleted("Ya no existe en Shopify");
      if (usage.numberOfOrders > 0) return notDeleted("Tiene pedidos");
      if (usage.isCompanyContact) {
        return notDeleted("Es contacto de una empresa en Shopify");
      }
      try {
        await gateway.deleteCustomer(customerId);
      } catch (error) {
        if (error instanceof ShopifyUserError) return notDeleted(error.message);
        if (error instanceof ShopifyNotFoundError) {
          return notDeleted("Ya no existe en Shopify");
        }
        throw error;
      }
      return { customerId, deleted: true };
    },

    // Actualizaciones (P16): se envían los datos vigentes al procesar el job.
    "customer.update": async (job, gateway) => {
      const client = await repo.getClient(job.entityId);
      if (!client) throw gone("El cliente");
      // Se convirtió en empresa: su Customer ya no es del cliente.
      if (client.kind !== "persona") return { skipped: true };
      if (!client.shopifyCustomerId) throw notSyncedYet("El cliente");
      await gateway.updateCustomer(
        client.shopifyCustomerId,
        customerChanges(client),
      );
      return { shopifyCustomerId: client.shopifyCustomerId };
    },

    "company.update": async (job, gateway) => {
      const client = await repo.getClient(job.entityId);
      if (!client) throw gone("El cliente");
      if (!client.shopifyCompanyId || !client.shopifyCompanyLocationId) {
        throw notSyncedYet("La empresa");
      }
      await gateway.updateCompany(
        {
          companyId: client.shopifyCompanyId,
          locationId: client.shopifyCompanyLocationId,
        },
        companyData(client),
      );
      return { shopifyCompanyId: client.shopifyCompanyId };
    },

    "contact.update": async (job, gateway) => {
      const contact = await repo.getContact(job.entityId);
      if (!contact) throw gone("El contacto");
      if (!contact.shopifyCustomerId) throw notSyncedYet("El contacto");
      await gateway.updateCustomer(
        contact.shopifyCustomerId,
        customerChanges(contact),
      );
      return { shopifyCustomerId: contact.shopifyCustomerId };
    },
  };
}
