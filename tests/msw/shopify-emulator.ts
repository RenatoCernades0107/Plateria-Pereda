import { http, HttpResponse, type JsonBodyType } from "msw";

import { ShopifyUserError } from "@/server/shopify/errors";
import { FakeShopifyGateway } from "@/server/shopify/fake";
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
      quantity: l.quantity,
      unfulfilledQuantity: l.fulfilled ? 0 : l.quantity,
      originalUnitPriceSet: amount(l.price),
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

const operations: Record<string, (variables: Vars) => Promise<JsonBodyType>> = {
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
            totalPriceSet: amount(String(Number(f.total))),
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
      return HttpResponse.json(await operation(variables ?? {}));
    },
  ),
];
