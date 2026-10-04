import { http, HttpResponse, type JsonBodyType } from "msw";

import { ShopifyUserError } from "@/server/shopify/errors";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import type { ShopifyCustomer, ShopifyOrder } from "@/server/shopify/types";

export const TEST_SHOP = "pereda-test.myshopify.com";
export const TEST_API_VERSION = "2026-10";

/**
 * Emula la Admin API de GraphQL de Shopify para probar el adaptador live: responde
 * cada operación con la forma de Shopify, usando el adaptador fake como "tienda".
 */
const store = new FakeShopifyGateway();

const customerNode = (c: ShopifyCustomer) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  displayName: c.displayName,
  note: c.note,
  updatedAt: c.updatedAt,
  defaultEmailAddress: c.email ? { emailAddress: c.email } : null,
  defaultPhoneNumber: c.phone ? { phoneNumber: c.phone } : null,
});

const amount = (value: string) => ({ shopMoney: { amount: value } });

const orderNode = (o: ShopifyOrder) => ({
  id: o.id,
  name: o.name,
  tags: o.tags,
  lineItems: {
    nodes: o.lines.map((l) => ({
      id: l.id,
      title: l.title,
      currentQuantity: l.quantity,
      unfulfilledQuantity: l.fulfilled ? 0 : l.quantity,
      // Shopify omite los ceros finales ("150.0").
      originalUnitPriceSet: amount(String(Number(l.price))),
    })),
  },
});

async function withUserErrors<T>(run: () => Promise<T>) {
  try {
    return { result: await run(), userErrors: [] };
  } catch (error) {
    if (error instanceof ShopifyUserError) {
      return { result: null, userErrors: error.fields };
    }
    throw error;
  }
}

type Vars = Record<string, unknown>;

const suffix = (gid: string) => gid.split("/").pop()!;
const IDEMPOTENT_KEY = /@idempotent\(key:\s*"([^"]+)"\)/;

/** Métodos de pago manual configurados en la tienda emulada. */
export const EMULATED_MANUAL_METHODS = new Set<string>();

/** Ediciones abiertas (orderEditBegin) hasta su commit. */
const edits = new Map<
  string,
  {
    orderId: string;
    remove: string[];
    add: { title: string; price: string; quantity: number }[];
  }
>();

/** La Company y su ubicación; el emulador da el rol de compra al crear el contacto. */
const companyRef = (companyId: string) => ({
  companyId,
  locationId:
    fakeShopify.snapshot().companies.find((c) => c.id === companyId)
      ?.locationId ?? "",
});

/** La Company dueña de una ubicación. */
const companyAt = (locationId: string) => {
  const company = fakeShopify
    .snapshot()
    .companies.find((c) => c.locationId === locationId);
  if (!company) throw new Error(`Ubicación desconocida: ${locationId}`);
  return company;
};

const userErrorsOf = (error: unknown) => {
  if (error instanceof ShopifyUserError) return error.fields;
  throw error;
};

const operations: Record<
  string,
  (variables: Vars, query: string) => Promise<JsonBodyType>
> = {
  CompanyCreate: async (variables: Vars) => {
    const input = variables.input as {
      company: { name: string; externalId: string };
      companyContact?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
      };
      companyLocation: {
        phone?: string;
        shippingAddress: { address1: string; city: string; zoneCode?: string };
      };
    };
    const { result, userErrors } = await withUserErrors(() =>
      store.createCompany({
        name: input.company.name,
        externalId: input.company.externalId,
        phone: input.companyLocation.phone ?? null,
        address: {
          address1: input.companyLocation.shippingAddress.address1,
          city: input.companyLocation.shippingAddress.city,
          zoneCode: input.companyLocation.shippingAddress.zoneCode ?? "",
        },
        contact: input.companyContact && {
          firstName: input.companyContact.firstName ?? "",
          lastName: input.companyContact.lastName ?? "",
          email: input.companyContact.email,
          phone: input.companyContact.phone,
        },
      }),
    );
    return {
      data: {
        companyCreate: {
          company: result && {
            id: result.id,
            name: result.name,
            externalId: result.externalId,
            contacts: {
              nodes: result.contacts.map((c) => ({
                id: c.id,
                customer: { id: c.customerId },
              })),
            },
            locations: { nodes: [{ id: result.locationId }] },
          },
          userErrors,
        },
      },
    };
  },
  CompanyUpdate: async (variables: Vars) => {
    const companyId = variables.companyId as string;
    const current = fakeShopify
      .snapshot()
      .companies.find((c) => c.id === companyId);
    if (!current) {
      return { data: { companyUpdate: { company: null, userErrors: [] } } };
    }
    const input = variables.input as { name: string; externalId: string };
    const { userErrors } = await withUserErrors(() =>
      store.updateCompany(companyRef(companyId), {
        name: input.name,
        externalId: input.externalId,
        phone: current.phone,
        address: current.address,
      }),
    );
    return {
      data: { companyUpdate: { company: { id: companyId }, userErrors } },
    };
  },
  CompanyLocationUpdate: async (variables: Vars) => {
    const current = companyAt(variables.companyLocationId as string);
    const input = variables.input as { phone?: string };
    const { userErrors } = await withUserErrors(() =>
      store.updateCompany(
        { companyId: current.id, locationId: current.locationId },
        {
          ...current,
          externalId: current.externalId ?? "",
          phone: input.phone ?? current.phone,
        },
      ),
    );
    return {
      data: {
        companyLocationUpdate: {
          companyLocation: { id: current.locationId },
          userErrors,
        },
      },
    };
  },
  CompanyLocationAssignAddress: async (variables: Vars) => {
    const current = companyAt(variables.locationId as string);
    const address = variables.address as {
      address1: string;
      city: string;
      zoneCode?: string;
    };
    const { userErrors } = await withUserErrors(() =>
      store.updateCompany(
        { companyId: current.id, locationId: current.locationId },
        {
          ...current,
          externalId: current.externalId ?? "",
          address: {
            address1: address.address1,
            city: address.city,
            zoneCode: address.zoneCode ?? "",
          },
        },
      ),
    );
    return {
      data: {
        companyLocationAssignAddress: {
          addresses: userErrors.length
            ? null
            : [{ id: "gid://shopify/CompanyAddress/1" }],
          userErrors,
        },
      },
    };
  },
  CompanyContactCreate: async (variables: Vars) => {
    const input = variables.input as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
    const { result, userErrors } = await withUserErrors(() =>
      store.createCompanyContact(companyRef(variables.companyId as string), {
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        email: input.email,
        phone: input.phone,
      }),
    );
    return {
      data: {
        companyContactCreate: {
          companyContact: result && {
            id: result.id,
            customer: { id: result.customerId },
          },
          userErrors,
        },
      },
    };
  },
  CompanyAssignCustomerAsContact: async (variables: Vars) => {
    const { result, userErrors } = await withUserErrors(() =>
      store.assignCustomerAsContact(
        companyRef(variables.companyId as string),
        variables.customerId as string,
      ),
    );
    return {
      data: {
        companyAssignCustomerAsContact: {
          companyContact: result && {
            id: result.id,
            customer: { id: result.customerId },
          },
          userErrors,
        },
      },
    };
  },
  CompanyContactRoles: async () => ({
    data: {
      company: {
        contactRoles: {
          nodes: [
            {
              id: "gid://shopify/CompanyContactRole/1",
              name: "Location admin",
            },
            { id: "gid://shopify/CompanyContactRole/2", name: "Ordering only" },
          ],
        },
      },
    },
  }),
  CompanyContactAssignRole: async () => ({
    data: {
      companyContactAssignRole: {
        companyContactRoleAssignment: {
          id: "gid://shopify/CompanyContactRoleAssignment/1",
        },
        userErrors: [],
      },
    },
  }),
  ShopCurrency: async () => ({ data: { shop: { currencyCode: "PEN" } } }),
  OrderCreate: async (variables: Vars) => {
    const order = variables.order as {
      customerId: string;
      companyLocationId?: string;
      tags: string[];
      note?: string;
      lineItems: {
        title: string;
        quantity: number;
        priceSet: { shopMoney: { amount: string } };
      }[];
      transactions: {
        gateway: string;
        amountSet: { shopMoney: { amount: string } };
      }[];
    };
    const { result, userErrors } = await withUserErrors(() =>
      store.createOrder({
        customerId: order.customerId,
        companyLocationId: order.companyLocationId,
        tags: order.tags,
        note: order.note,
        lines: order.lineItems.map((l) => ({
          title: l.title,
          quantity: l.quantity,
          price: l.priceSet.shopMoney.amount,
        })),
        payments: order.transactions.map((t) => ({
          gateway: t.gateway,
          amount: t.amountSet.shopMoney.amount,
        })),
      }),
    );
    return {
      data: { orderCreate: { order: result && orderNode(result), userErrors } },
    };
  },
  OrderGet: async (variables: Vars) => {
    const order = fakeShopify
      .snapshot()
      .orders.find((o) => o.id === variables.id);
    return { data: { order: order ? orderNode(order) : null } };
  },
  OrderEditBegin: async (variables: Vars) => {
    const order = fakeShopify
      .snapshot()
      .orders.find((o) => o.id === variables.id);
    if (!order) {
      return {
        data: {
          orderEditBegin: {
            calculatedOrder: null,
            userErrors: [{ field: ["id"], message: "Order not found" }],
          },
        },
      };
    }
    const id = `gid://shopify/CalculatedOrder/${suffix(order.id)}`;
    edits.set(id, { orderId: order.id, remove: [], add: [] });
    return {
      data: {
        orderEditBegin: {
          calculatedOrder: {
            id,
            lineItems: {
              nodes: order.lines.map((l) => ({
                id: `gid://shopify/CalculatedLineItem/${suffix(l.id)}`,
                quantity: l.quantity,
              })),
            },
          },
          userErrors: [],
        },
      },
    };
  },
  OrderEditSetQuantity: async (variables: Vars) => {
    const edit = edits.get(variables.id as string)!;
    edit.remove.push(
      `gid://shopify/LineItem/${suffix(variables.lineItemId as string)}`,
    );
    return {
      data: {
        orderEditSetQuantity: {
          calculatedOrder: { id: variables.id },
          userErrors: [],
        },
      },
    };
  },
  OrderEditAddCustomItem: async (variables: Vars) => {
    const edit = edits.get(variables.id as string)!;
    edit.add.push({
      title: variables.title as string,
      price: (variables.price as { amount: string }).amount,
      quantity: variables.quantity as number,
    });
    return {
      data: {
        orderEditAddCustomItem: {
          calculatedLineItem: { id: "x" },
          userErrors: [],
        },
      },
    };
  },
  OrderEditCommit: async (variables: Vars) => {
    const edit = edits.get(variables.id as string)!;
    edits.delete(variables.id as string);
    const { result, userErrors } = await withUserErrors(() =>
      store.editOrder(edit.orderId, {
        removeLineIds: edit.remove,
        addLines: edit.add,
      }),
    );
    return {
      data: {
        orderEditCommit: { order: result && orderNode(result), userErrors },
      },
    };
  },
  OrderCreateManualPayment: async (variables: Vars) => {
    const name = variables.paymentMethodName as string | undefined;
    if (name && !EMULATED_MANUAL_METHODS.has(name)) {
      return {
        data: {
          orderCreateManualPayment: {
            order: null,
            userErrors: [
              {
                field: ["paymentMethodName"],
                message: "Payment provider is not configured on shop.",
              },
            ],
          },
        },
      };
    }
    try {
      await store.recordFullPayment(variables.id as string, name ?? "manual");
      return {
        data: {
          orderCreateManualPayment: {
            order: { id: variables.id },
            userErrors: [],
          },
        },
      };
    } catch (error) {
      return {
        data: {
          orderCreateManualPayment: {
            order: null,
            userErrors: userErrorsOf(error),
          },
        },
      };
    }
  },
  OrderTransactions: async (variables: Vars) => {
    const order = fakeShopify
      .snapshot()
      .orders.find((o) => o.id === variables.id);
    return {
      data: {
        order: order && {
          transactions: order.transactions.map((t, i) => ({
            id: `gid://shopify/OrderTransaction/${suffix(order.id)}${i}`,
            kind: t.cents > 0 ? "SALE" : "REFUND",
            status: "SUCCESS",
            gateway: t.gateway,
          })),
        },
      },
    };
  },
  RefundCreate: async (variables: Vars, query: string) => {
    const key = IDEMPOTENT_KEY.exec(query)?.[1];
    if (!key) {
      return {
        errors: [
          {
            message:
              "The @idempotent directive is required for this mutation but was not provided.",
          },
        ],
      };
    }
    const input = variables.input as {
      orderId: string;
      note?: string;
      transactions: { gateway: string; amount: string }[];
    };
    const t = input.transactions[0]!;
    try {
      await store.refundPayment(input.orderId, {
        amount: t.amount,
        gateway: t.gateway,
        note: input.note,
        idempotencyKey: key,
      });
      return {
        data: { refundCreate: { refund: { id: "r" }, userErrors: [] } },
      };
    } catch (error) {
      return {
        data: {
          refundCreate: { refund: null, userErrors: userErrorsOf(error) },
        },
      };
    }
  },
  FulfillmentOrders: async (variables: Vars) => {
    const order = fakeShopify
      .snapshot()
      .orders.find((o) => o.id === variables.id);
    return {
      data: {
        order: order && {
          fulfillmentOrders: {
            nodes: [
              {
                id: `gid://shopify/FulfillmentOrder/${suffix(order.id)}`,
                lineItems: {
                  nodes: order.lines.map((l) => ({
                    id: `gid://shopify/FulfillmentOrderLineItem/${suffix(l.id)}`,
                    remainingQuantity: l.fulfilled ? 0 : l.quantity,
                    lineItem: { id: l.id },
                  })),
                },
              },
            ],
          },
        },
      },
    };
  },
  FulfillmentCreate: async (variables: Vars) => {
    const { lineItemsByFulfillmentOrder } = variables.fulfillment as {
      lineItemsByFulfillmentOrder: {
        fulfillmentOrderId: string;
        fulfillmentOrderLineItems: { id: string }[];
      }[];
    };
    const group = lineItemsByFulfillmentOrder[0]!;
    const orderId = `gid://shopify/Order/${suffix(group.fulfillmentOrderId)}`;
    await store.fulfillLines(
      orderId,
      group.fulfillmentOrderLineItems.map(
        (i) => `gid://shopify/LineItem/${suffix(i.id)}`,
      ),
    );
    return {
      data: { fulfillmentCreate: { fulfillment: { id: "f" }, userErrors: [] } },
    };
  },
  CustomerCreate: async (variables: Vars) => {
    const { input } = variables as { input: Vars };
    const { result, userErrors } = await withUserErrors(() =>
      store.createCustomer({
        firstName: (input.firstName as string) ?? "",
        lastName: (input.lastName as string) ?? "",
        email: input.email as string | undefined,
        phone: input.phone as string | undefined,
        note: input.note as string | undefined,
      }),
    );
    return {
      data: {
        customerCreate: {
          customer: result && customerNode(result),
          userErrors,
        },
      },
    };
  },
  CustomerUpdate: async (variables: Vars) => {
    const { id, ...input } = (variables as { input: Vars }).input;
    if (!(await store.getCustomer(id as string))) {
      return {
        data: {
          customerUpdate: {
            customer: null,
            userErrors: [{ field: ["id"], message: "Customer does not exist" }],
          },
        },
      };
    }
    const { result, userErrors } = await withUserErrors(() =>
      store.updateCustomer(id as string, input),
    );
    return {
      data: {
        customerUpdate: {
          customer: result && customerNode(result),
          userErrors,
        },
      },
    };
  },
  CustomersSearch: async (variables: Vars) => {
    const { query, first, after } = variables as {
      query: string | null;
      first: number;
      after: string | null;
    };
    const page = await store.searchCustomers(query ?? "", { first, after });
    return {
      data: {
        customers: {
          nodes: page.items.map(customerNode),
          pageInfo: page.pageInfo,
        },
      },
    };
  },
  CustomerGet: async (variables: Vars) => {
    const customer = await store.getCustomer(variables.id as string);
    return {
      data: { customer: customer && customerNode(customer) },
    };
  },
  OrderFindByTag: async (variables: Vars) => {
    // tag:'RES-00001' → RES-00001
    const tag = /^tag:'(.*)'$/.exec(variables.query as string)?.[1] ?? "";
    const order = await store.findOrderByTag(tag.replace(/\\(.)/g, "$1"));
    return {
      data: { orders: { nodes: order ? [orderNode(order)] : [] } },
    };
  },
  OrderFinancials: async (variables: Vars) => {
    try {
      const f = await store.getOrderFinancials(variables.id as string);
      return {
        data: {
          order: {
            id: f.id,
            name: f.name,
            displayFinancialStatus: f.financialStatus,
            // Shopify a veces omite los ceros finales ("200.0").
            currentTotalPriceSet: amount(String(Number(f.total))),
            totalReceivedSet: amount(f.received),
            totalOutstandingSet: amount(f.outstanding),
          },
        },
      };
    } catch {
      return { data: { order: null } };
    }
  },
  ProductsSearch: async (variables: Vars) => {
    const { query, first, after } = variables as {
      query: string | null;
      first: number;
      after: string | null;
    };
    // title:*fuente* → fuente
    const text = query ? query.replace(/^title:\*(.*)\*$/, "$1") : "";
    const page = await store.searchProducts(text, { first, after });
    return {
      data: {
        products: {
          nodes: page.items.map((p) => ({
            id: p.id,
            title: p.title,
            featuredMedia: p.imageUrl
              ? { preview: { image: { url: p.imageUrl } } }
              : null,
            priceRangeV2: {
              minVariantPrice: { amount: p.minPrice },
              maxVariantPrice: { amount: p.maxPrice },
            },
          })),
          pageInfo: page.pageInfo,
        },
      },
    };
  },
  ProductGet: async (variables: Vars) => {
    const p = await store.getProduct(variables.id as string);
    return {
      data: {
        product: p && {
          id: p.id,
          title: p.title,
          description: p.description,
          featuredMedia: null,
          variants: {
            nodes: p.variants.map((v) => ({
              id: v.id,
              title: v.title,
              price: v.price,
              sku: v.sku ?? "",
              image: v.imageUrl ? { url: v.imageUrl } : null,
            })),
          },
        },
      },
    };
  },
};

export const shopifyEmulator = [
  http.post(`https://${TEST_SHOP}/admin/oauth/access_token`, () =>
    HttpResponse.json({
      access_token: "shpat_emulado",
      scope: "",
      expires_in: 86399,
    }),
  ),
  http.post(
    `https://${TEST_SHOP}/admin/api/${TEST_API_VERSION}/graphql.json`,
    async ({ request }) => {
      const { query, variables } = (await request.json()) as {
        query: string;
        variables?: Vars;
      };
      const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
      const operation = operations[name];
      if (!operation) {
        return HttpResponse.json({
          errors: [{ message: `Operación no emulada: ${name}` }],
        });
      }
      return HttpResponse.json(await operation(variables ?? {}, query));
    },
  ),
];
