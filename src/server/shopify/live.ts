import { ShopifyNotFoundError, ShopifyNotImplementedError } from "./errors";
import type { ShopifyGateway } from "./gateway";
import { assertNoUserErrors, type GraphqlClient } from "./graphql-client";
import type {
  CustomerInput,
  FinancialStatus,
  OrderFinancials,
  Page,
  PageOptions,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyProduct,
  ShopifyProductSummary,
} from "./types";

type UserErrors = { field: string[] | null; message: string }[];
type Amount = { shopMoney: { amount: string } };
type PageInfo = { hasNextPage: boolean; endCursor: string | null };

// Los nombres de operación (CustomerCreate, …) también los usa el emulador de los tests.
const CUSTOMER_FIELDS = `
  id
  firstName
  lastName
  displayName
  note
  updatedAt
  defaultEmailAddress { emailAddress }
  defaultPhoneNumber { phoneNumber }
`;

export const CUSTOMER_CREATE = `mutation CustomerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { ${CUSTOMER_FIELDS} }
    userErrors { field message }
  }
}`;

export const CUSTOMER_UPDATE = `mutation CustomerUpdate($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer { ${CUSTOMER_FIELDS} }
    userErrors { field message }
  }
}`;

export const CUSTOMERS_SEARCH = `query CustomersSearch($query: String, $first: Int!, $after: String) {
  customers(query: $query, first: $first, after: $after) {
    nodes { ${CUSTOMER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

export const CUSTOMER_GET = `query CustomerGet($id: ID!) {
  customer(id: $id) { ${CUSTOMER_FIELDS} }
}`;

const ORDER_FIELDS = `
  id
  name
  tags
  lineItems(first: 250) {
    nodes {
      id
      title
      quantity
      unfulfilledQuantity
      originalUnitPriceSet { shopMoney { amount } }
    }
  }
`;

export const ORDER_FIND_BY_TAG = `query OrderFindByTag($query: String!) {
  orders(query: $query, first: 1) { nodes { ${ORDER_FIELDS} } }
}`;

export const ORDER_FINANCIALS = `query OrderFinancials($id: ID!) {
  order(id: $id) {
    id
    name
    displayFinancialStatus
    totalPriceSet { shopMoney { amount } }
    totalReceivedSet { shopMoney { amount } }
    totalOutstandingSet { shopMoney { amount } }
  }
}`;

const IMAGE = `featuredMedia { preview { image { url } } }`;

export const PRODUCTS_SEARCH = `query ProductsSearch($query: String, $first: Int!, $after: String) {
  products(query: $query, first: $first, after: $after) {
    nodes {
      id
      title
      ${IMAGE}
      priceRangeV2 {
        minVariantPrice { amount }
        maxVariantPrice { amount }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export const PRODUCT_GET = `query ProductGet($id: ID!) {
  product(id: $id) {
    id
    title
    description
    ${IMAGE}
    variants(first: 100) {
      nodes { id title price sku image { url } }
    }
  }
}`;

type CustomerNode = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  note: string | null;
  updatedAt: string;
  defaultEmailAddress: { emailAddress: string } | null;
  defaultPhoneNumber: { phoneNumber: string } | null;
};

type OrderNode = {
  id: string;
  name: string;
  tags: string[];
  lineItems: {
    nodes: {
      id: string;
      title: string;
      quantity: number;
      unfulfilledQuantity: number;
      originalUnitPriceSet: Amount;
    }[];
  };
};

type ImageField = {
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
};

function toCustomer(node: CustomerNode): ShopifyCustomer {
  return {
    id: node.id,
    firstName: node.firstName ?? "",
    lastName: node.lastName ?? "",
    displayName: node.displayName,
    email: node.defaultEmailAddress?.emailAddress ?? null,
    phone: node.defaultPhoneNumber?.phoneNumber ?? null,
    note: node.note ?? "",
    updatedAt: node.updatedAt,
  };
}

function toOrder(node: OrderNode): ShopifyOrder {
  return {
    id: node.id,
    name: node.name,
    tags: node.tags,
    lines: node.lineItems.nodes.map((l) => ({
      id: l.id,
      title: l.title,
      quantity: l.quantity,
      price: l.originalUnitPriceSet.shopMoney.amount,
      fulfilled: l.unfulfilledQuantity === 0,
    })),
  };
}

const imageUrl = (node: ImageField) =>
  node.featuredMedia?.preview?.image?.url ?? null;

/** Normaliza los montos de Shopify ("200.0") a dos decimales ("200.00"). */
const money = (amount: string) => Number(amount).toFixed(2);

function customerInput(input: Partial<CustomerInput>) {
  return Object.fromEntries(
    Object.entries({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      note: input.note,
    }).filter(([, value]) => value !== undefined),
  );
}

/** Escapa comillas para el lenguaje de búsqueda de Shopify. */
const quote = (value: string) => `'${value.replace(/['\\]/g, "\\$&")}'`;

/** Adaptador que llama a la Admin API de GraphQL de la tienda. */
export class LiveShopifyGateway implements ShopifyGateway {
  constructor(private readonly client: GraphqlClient) {}

  async createCustomer(input: CustomerInput) {
    const data = await this.client.request<{
      customerCreate: { customer: CustomerNode | null; userErrors: UserErrors };
    }>(CUSTOMER_CREATE, { input: customerInput(input) });
    assertNoUserErrors(data.customerCreate.userErrors);
    return toCustomer(data.customerCreate.customer!);
  }

  async updateCustomer(id: string, input: Partial<CustomerInput>) {
    const data = await this.client.request<{
      customerUpdate: { customer: CustomerNode | null; userErrors: UserErrors };
    }>(CUSTOMER_UPDATE, { input: { id, ...customerInput(input) } });
    assertNoUserErrors(data.customerUpdate.userErrors);
    if (!data.customerUpdate.customer) throw new ShopifyNotFoundError(id);
    return toCustomer(data.customerUpdate.customer);
  }

  async searchCustomers(
    query: string,
    { first = 20, after = null }: PageOptions = {},
  ): Promise<Page<ShopifyCustomer>> {
    const data = await this.client.request<{
      customers: { nodes: CustomerNode[]; pageInfo: PageInfo };
    }>(CUSTOMERS_SEARCH, { query: query.trim() || null, first, after });
    return {
      items: data.customers.nodes.map(toCustomer),
      pageInfo: data.customers.pageInfo,
    };
  }

  async getCustomer(id: string) {
    const data = await this.client.request<{ customer: CustomerNode | null }>(
      CUSTOMER_GET,
      { id },
    );
    return data.customer ? toCustomer(data.customer) : null;
  }

  async findOrderByTag(tag: string) {
    const data = await this.client.request<{ orders: { nodes: OrderNode[] } }>(
      ORDER_FIND_BY_TAG,
      { query: `tag:${quote(tag)}` },
    );
    const node = data.orders.nodes[0];
    return node ? toOrder(node) : null;
  }

  async getOrderFinancials(orderId: string): Promise<OrderFinancials> {
    const data = await this.client.request<{
      order: {
        id: string;
        name: string;
        displayFinancialStatus: FinancialStatus;
        totalPriceSet: Amount;
        totalReceivedSet: Amount;
        totalOutstandingSet: Amount;
      } | null;
    }>(ORDER_FINANCIALS, { id: orderId });
    if (!data.order) throw new ShopifyNotFoundError(orderId);
    return {
      id: data.order.id,
      name: data.order.name,
      financialStatus: data.order.displayFinancialStatus,
      total: money(data.order.totalPriceSet.shopMoney.amount),
      received: money(data.order.totalReceivedSet.shopMoney.amount),
      outstanding: money(data.order.totalOutstandingSet.shopMoney.amount),
    };
  }

  async searchProducts(
    query: string,
    { first = 20, after = null }: PageOptions = {},
  ): Promise<Page<ShopifyProductSummary>> {
    const q = query.trim();
    const data = await this.client.request<{
      products: {
        nodes: (ImageField & {
          id: string;
          title: string;
          priceRangeV2: {
            minVariantPrice: { amount: string };
            maxVariantPrice: { amount: string };
          };
        })[];
        pageInfo: PageInfo;
      };
    }>(PRODUCTS_SEARCH, {
      query: q ? `title:*${q.replace(/[*'\\]/g, "")}*` : null,
      first,
      after,
    });
    return {
      items: data.products.nodes.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: imageUrl(p),
        minPrice: money(p.priceRangeV2.minVariantPrice.amount),
        maxPrice: money(p.priceRangeV2.maxVariantPrice.amount),
      })),
      pageInfo: data.products.pageInfo,
    };
  }

  async getProduct(id: string): Promise<ShopifyProduct | null> {
    const data = await this.client.request<{
      product:
        | (ImageField & {
            id: string;
            title: string;
            description: string;
            variants: {
              nodes: {
                id: string;
                title: string;
                price: string;
                sku: string | null;
                image: { url: string } | null;
              }[];
            };
          })
        | null;
    }>(PRODUCT_GET, { id });
    const p = data.product;
    if (!p) return null;
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: imageUrl(p),
      variants: p.variants.nodes.map((v) => ({
        id: v.id,
        title: v.title,
        price: money(v.price),
        sku: v.sku || null,
        imageUrl: v.image?.url ?? null,
      })),
    };
  }

  // Las escrituras de órdenes dependen de lo que confirme el spike 4.1 en la tienda de
  // desarrollo (orderCreate con pagos, Order Editing, fulfillment orders).
  async createOrder(): Promise<ShopifyOrder> {
    throw new ShopifyNotImplementedError("createOrder");
  }
  async editOrder(): Promise<ShopifyOrder> {
    throw new ShopifyNotImplementedError("editOrder");
  }
  async recordFullPayment(): Promise<OrderFinancials> {
    throw new ShopifyNotImplementedError("recordFullPayment");
  }
  async refundPayment(): Promise<OrderFinancials> {
    throw new ShopifyNotImplementedError("refundPayment");
  }
  async fulfillLines(): Promise<ShopifyOrder> {
    throw new ShopifyNotImplementedError("fulfillLines");
  }
}
