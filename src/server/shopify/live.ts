import { ShopifyNotFoundError, ShopifyUserError } from "./errors";
import type { ShopifyGateway } from "./gateway";
import { assertNoUserErrors, type GraphqlClient } from "./graphql-client";
import type {
  CompanyInput,
  CompanyRef,
  CustomerInput,
  CustomLine,
  FinancialStatus,
  OrderEdit,
  OrderInput,
  RefundInput,
  OrderFinancials,
  Page,
  PageOptions,
  ShopifyCompany,
  ShopifyCompanyContact,
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
      currentQuantity
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
    currentTotalPriceSet { shopMoney { amount } }
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

const COMPANY_FIELDS = `
  id
  name
  externalId
  contacts(first: 50) { nodes { id customer { id } } }
  locations(first: 1) { nodes { id } }
`;

export const COMPANY_CREATE = `mutation CompanyCreate($input: CompanyCreateInput!) {
  companyCreate(input: $input) {
    company { ${COMPANY_FIELDS} }
    userErrors { field message }
  }
}`;

export const COMPANY_CONTACT_CREATE = `mutation CompanyContactCreate($companyId: ID!, $input: CompanyContactInput!) {
  companyContactCreate(companyId: $companyId, input: $input) {
    companyContact { id customer { id } }
    userErrors { field message }
  }
}`;

export const COMPANY_ASSIGN_CUSTOMER = `mutation CompanyAssignCustomerAsContact($companyId: ID!, $customerId: ID!) {
  companyAssignCustomerAsContact(companyId: $companyId, customerId: $customerId) {
    companyContact { id customer { id } }
    userErrors { field message }
  }
}`;

export const COMPANY_CONTACT_ROLES = `query CompanyContactRoles($companyId: ID!) {
  company(id: $companyId) { contactRoles(first: 10) { nodes { id name } } }
}`;

export const COMPANY_CONTACT_ASSIGN_ROLE = `mutation CompanyContactAssignRole($companyContactId: ID!, $companyContactRoleId: ID!, $companyLocationId: ID!) {
  companyContactAssignRole(
    companyContactId: $companyContactId
    companyContactRoleId: $companyContactRoleId
    companyLocationId: $companyLocationId
  ) {
    companyContactRoleAssignment { id }
    userErrors { field message }
  }
}`;

export const SHOP_CURRENCY = `query ShopCurrency { shop { currencyCode } }`;

export const ORDER_CREATE = `mutation OrderCreate($order: OrderCreateOrderInput!) {
  orderCreate(order: $order, options: { inventoryBehaviour: BYPASS, sendReceipt: false }) {
    order { ${ORDER_FIELDS} }
    userErrors { field message }
  }
}`;

export const ORDER_GET = `query OrderGet($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`;

export const ORDER_EDIT_BEGIN = `mutation OrderEditBegin($id: ID!) {
  orderEditBegin(id: $id) {
    calculatedOrder { id lineItems(first: 250) { nodes { id quantity } } }
    userErrors { field message }
  }
}`;

export const ORDER_EDIT_ADD_ITEM = `mutation OrderEditAddCustomItem($id: ID!, $title: String!, $price: MoneyInput!, $quantity: Int!) {
  orderEditAddCustomItem(id: $id, title: $title, price: $price, quantity: $quantity, requiresShipping: false) {
    calculatedLineItem { id }
    userErrors { field message }
  }
}`;

export const ORDER_EDIT_SET_QUANTITY = `mutation OrderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
  orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
    calculatedOrder { id }
    userErrors { field message }
  }
}`;

export const ORDER_EDIT_COMMIT = `mutation OrderEditCommit($id: ID!) {
  orderEditCommit(id: $id, notifyCustomer: false) {
    order { ${ORDER_FIELDS} }
    userErrors { field message }
  }
}`;

export const ORDER_MANUAL_PAYMENT = `mutation OrderCreateManualPayment($id: ID!, $paymentMethodName: String) {
  orderCreateManualPayment(id: $id, paymentMethodName: $paymentMethodName) {
    order { id }
    userErrors { field message }
  }
}`;

export const ORDER_TRANSACTIONS = `query OrderTransactions($id: ID!) {
  order(id: $id) { transactions { id kind status gateway } }
}`;

export const REFUND_CREATE = (
  key: string,
) => `mutation RefundCreate($input: RefundInput!) {
  refundCreate(input: $input) @idempotent(key: ${JSON.stringify(key)}) {
    refund { id }
    userErrors { field message }
  }
}`;

export const FULFILLMENT_ORDERS = `query FulfillmentOrders($id: ID!) {
  order(id: $id) {
    fulfillmentOrders(first: 20) {
      nodes { id lineItems(first: 250) { nodes { id remainingQuantity lineItem { id } } } }
    }
  }
}`;

export const FULFILLMENT_CREATE = `mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id }
    userErrors { field message }
  }
}`;

type CompanyNode = {
  id: string;
  name: string;
  externalId: string | null;
  contacts: { nodes: { id: string; customer: { id: string } }[] };
  locations: { nodes: { id: string }[] };
};

type ContactNode = { id: string; customer: { id: string } };

const toContact = (node: ContactNode) => ({
  id: node.id,
  customerId: node.customer.id,
});

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
      currentQuantity: number;
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
    // Las líneas quitadas en una edición siguen en la orden con cantidad vigente 0.
    lines: node.lineItems.nodes
      .filter((l) => l.currentQuantity > 0)
      .map((l) => ({
        id: l.id,
        title: l.title,
        quantity: l.currentQuantity,
        price: money(l.originalUnitPriceSet.shopMoney.amount),
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

/** CompanyContactInput no tiene nota, a diferencia de CustomerInput. */
function companyContactInput(input: CustomerInput) {
  return customerInput({ ...input, note: undefined });
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

  async createCompany(input: CompanyInput): Promise<ShopifyCompany> {
    const data = await this.client.request<{
      companyCreate: { company: CompanyNode | null; userErrors: UserErrors };
    }>(COMPANY_CREATE, {
      input: {
        company: { name: input.name, externalId: input.externalId },
        ...(input.contact && {
          companyContact: companyContactInput(input.contact),
        }),
        companyLocation: {
          name: "Principal",
          ...(input.phone && { phone: input.phone }),
          // Perú exige la región; con billingSameAsShipping basta la dirección de envío.
          shippingAddress: {
            address1: input.address.address1,
            city: input.address.city,
            zoneCode: input.address.zoneCode,
            countryCode: "PE",
          },
          billingSameAsShipping: true,
        },
      },
    });
    assertNoUserErrors(data.companyCreate.userErrors);
    const company = data.companyCreate.company!;
    return {
      id: company.id,
      name: company.name,
      externalId: company.externalId,
      locationId: company.locations.nodes[0]!.id,
      contacts: company.contacts.nodes.map(toContact),
    };
  }

  /**
   * Sin rol en la ubicación, Shopify no deja crear órdenes a nombre del contacto
   * (spike 4.1): se le asigna el rol de compra ("Ordering only" si existe).
   */
  private async assignOrderingRole(
    company: CompanyRef,
    companyContactId: string,
  ) {
    const roles = await this.client.request<{
      company: {
        contactRoles: { nodes: { id: string; name: string }[] };
      } | null;
    }>(COMPANY_CONTACT_ROLES, { companyId: company.companyId });
    const nodes = roles.company?.contactRoles.nodes ?? [];
    const role = nodes.find((r) => /order/i.test(r.name)) ?? nodes[0];
    if (!role) {
      throw new ShopifyUserError([
        {
          field: ["companyContactRoleId"],
          message: "La empresa no tiene roles de contacto",
        },
      ]);
    }
    const data = await this.client.request<{
      companyContactAssignRole: { userErrors: UserErrors };
    }>(COMPANY_CONTACT_ASSIGN_ROLE, {
      companyContactId,
      companyContactRoleId: role.id,
      companyLocationId: company.locationId,
    });
    assertNoUserErrors(data.companyContactAssignRole.userErrors);
  }

  async createCompanyContact(
    company: CompanyRef,
    input: CustomerInput,
  ): Promise<ShopifyCompanyContact> {
    const data = await this.client.request<{
      companyContactCreate: {
        companyContact: ContactNode | null;
        userErrors: UserErrors;
      };
    }>(COMPANY_CONTACT_CREATE, {
      companyId: company.companyId,
      input: companyContactInput(input),
    });
    assertNoUserErrors(data.companyContactCreate.userErrors);
    const contact = toContact(data.companyContactCreate.companyContact!);
    await this.assignOrderingRole(company, contact.id);
    return contact;
  }

  async assignCustomerAsContact(
    company: CompanyRef,
    customerId: string,
  ): Promise<ShopifyCompanyContact> {
    const data = await this.client.request<{
      companyAssignCustomerAsContact: {
        companyContact: ContactNode | null;
        userErrors: UserErrors;
      };
    }>(COMPANY_ASSIGN_CUSTOMER, { companyId: company.companyId, customerId });
    assertNoUserErrors(data.companyAssignCustomerAsContact.userErrors);
    const contact = toContact(
      data.companyAssignCustomerAsContact.companyContact!,
    );
    await this.assignOrderingRole(company, contact.id);
    return contact;
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
        currentTotalPriceSet: Amount;
        totalReceivedSet: Amount;
        totalOutstandingSet: Amount;
      } | null;
    }>(ORDER_FINANCIALS, { id: orderId });
    if (!data.order) throw new ShopifyNotFoundError(orderId);
    return {
      id: data.order.id,
      name: data.order.name,
      financialStatus: data.order.displayFinancialStatus,
      // currentTotal: el total vigente tras las ediciones (totalPrice queda en el original).
      total: money(data.order.currentTotalPriceSet.shopMoney.amount),
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

  private currency: Promise<string> | null = null;

  /** Moneda de la tienda (PEN en la Platería, USD en la de desarrollo). */
  private shopCurrency() {
    this.currency ??= this.client
      .request<{ shop: { currencyCode: string } }>(SHOP_CURRENCY)
      .then((d) => d.shop.currencyCode)
      .catch((error: unknown) => {
        this.currency = null;
        throw error;
      });
    return this.currency;
  }

  private async moneyInput(amount: string) {
    return { amount, currencyCode: await this.shopCurrency() };
  }

  private async getOrder(id: string) {
    const data = await this.client.request<{ order: OrderNode | null }>(
      ORDER_GET,
      { id },
    );
    if (!data.order) throw new ShopifyNotFoundError(id);
    return toOrder(data.order);
  }

  async createOrder(input: OrderInput): Promise<ShopifyOrder> {
    const currencyCode = await this.shopCurrency();
    const shopMoney = (amount: string) => ({
      shopMoney: { amount, currencyCode },
    });
    const data = await this.client.request<{
      orderCreate: { order: OrderNode | null; userErrors: UserErrors };
    }>(ORDER_CREATE, {
      order: {
        customerId: input.customerId,
        ...(input.companyLocationId && {
          companyLocationId: input.companyLocationId,
        }),
        currency: currencyCode,
        tags: input.tags,
        note: input.note,
        lineItems: input.lines.map((line) => ({
          title: line.title,
          quantity: line.quantity,
          priceSet: shopMoney(line.price),
          requiresShipping: false,
          taxable: true,
        })),
        transactions: (input.payments ?? []).map((p) => ({
          kind: "SALE",
          status: "SUCCESS",
          gateway: p.gateway,
          amountSet: shopMoney(p.amount),
        })),
      },
    });
    assertNoUserErrors(data.orderCreate.userErrors);
    return toOrder(data.orderCreate.order!);
  }

  async editOrder(orderId: string, edit: OrderEdit): Promise<ShopifyOrder> {
    const current = await this.getOrder(orderId);
    const begin = await this.client.request<{
      orderEditBegin: {
        calculatedOrder: {
          id: string;
          lineItems: { nodes: { id: string }[] };
        } | null;
        userErrors: UserErrors;
      };
    }>(ORDER_EDIT_BEGIN, { id: orderId });
    assertNoUserErrors(begin.orderEditBegin.userErrors);
    const calc = begin.orderEditBegin.calculatedOrder!;

    // La línea calculada tiene otro id pero el mismo número final que la línea original.
    const calculatedId = (lineId: string) => {
      const suffix = lineId.split("/").pop();
      const found = calc.lineItems.nodes.find(
        (n) => n.id.split("/").pop() === suffix,
      );
      if (!found) {
        throw new ShopifyUserError([
          { field: ["lineItemId"], message: `Line item ${lineId} not found` },
        ]);
      }
      return found.id;
    };

    const repriced: CustomLine[] = [];
    for (const { lineId, price } of edit.setPrices ?? []) {
      const line = current.lines.find((l) => l.id === lineId);
      if (!line) {
        throw new ShopifyUserError([
          { field: ["lineItemId"], message: `Line item ${lineId} not found` },
        ]);
      }
      repriced.push({ title: line.title, price, quantity: line.quantity });
    }
    const removals = [
      ...(edit.removeLineIds ?? []),
      ...(edit.setPrices ?? []).map((p) => p.lineId),
    ];
    for (const lineId of removals) {
      const result = await this.client.request<{
        orderEditSetQuantity: { userErrors: UserErrors };
      }>(ORDER_EDIT_SET_QUANTITY, {
        id: calc.id,
        lineItemId: calculatedId(lineId),
        quantity: 0,
      });
      assertNoUserErrors(result.orderEditSetQuantity.userErrors);
    }
    for (const line of [...repriced, ...(edit.addLines ?? [])]) {
      const result = await this.client.request<{
        orderEditAddCustomItem: { userErrors: UserErrors };
      }>(ORDER_EDIT_ADD_ITEM, {
        id: calc.id,
        title: line.title,
        price: await this.moneyInput(line.price),
        quantity: line.quantity,
      });
      assertNoUserErrors(result.orderEditAddCustomItem.userErrors);
    }

    const commit = await this.client.request<{
      orderEditCommit: { order: OrderNode | null; userErrors: UserErrors };
    }>(ORDER_EDIT_COMMIT, { id: calc.id });
    assertNoUserErrors(commit.orderEditCommit.userErrors);
    return toOrder(commit.orderEditCommit.order!);
  }

  async recordFullPayment(orderId: string, gateway: string) {
    const pay = (paymentMethodName?: string) =>
      this.client.request<{
        orderCreateManualPayment: { userErrors: UserErrors };
      }>(ORDER_MANUAL_PAYMENT, { id: orderId, paymentMethodName });

    // El nombre debe existir como método de pago manual en la tienda; si no, Shopify
    // responde "Payment provider is not configured" y se registra sin nombre ("manual").
    // El sistema conserva el método real del pago (spike 4.1).
    let data = await pay(gateway);
    if (
      data.orderCreateManualPayment.userErrors.some((e) =>
        e.field?.includes("paymentMethodName"),
      )
    ) {
      data = await pay(undefined);
    }
    assertNoUserErrors(data.orderCreateManualPayment.userErrors);
    return this.getOrderFinancials(orderId);
  }

  async refundPayment(orderId: string, refund: RefundInput) {
    const { order } = await this.client.request<{
      order: {
        transactions: {
          id: string;
          kind: string;
          status: string;
          gateway: string;
        }[];
      } | null;
    }>(ORDER_TRANSACTIONS, { id: orderId });
    if (!order) throw new ShopifyNotFoundError(orderId);
    const parent = order.transactions.find(
      (t) =>
        t.status === "SUCCESS" &&
        (t.kind === "SALE" || t.kind === "CAPTURE") &&
        t.gateway === refund.gateway,
    );
    if (!parent) {
      throw new ShopifyUserError([
        {
          field: ["gateway"],
          message: `No hay un pago con ${refund.gateway} para reembolsar`,
        },
      ]);
    }
    const data = await this.client.request<{
      refundCreate: { userErrors: UserErrors };
    }>(REFUND_CREATE(refund.idempotencyKey), {
      input: {
        orderId,
        note: refund.note,
        notify: false,
        transactions: [
          {
            orderId,
            parentId: parent.id,
            kind: "REFUND",
            gateway: refund.gateway,
            amount: refund.amount,
          },
        ],
      },
    });
    assertNoUserErrors(data.refundCreate.userErrors);
    return this.getOrderFinancials(orderId);
  }

  async fulfillLines(orderId: string, lineIds: string[]) {
    const data = await this.client.request<{
      order: {
        fulfillmentOrders: {
          nodes: {
            id: string;
            lineItems: {
              nodes: {
                id: string;
                remainingQuantity: number;
                lineItem: { id: string };
              }[];
            };
          }[];
        };
      } | null;
    }>(FULFILLMENT_ORDERS, { id: orderId });
    if (!data.order) throw new ShopifyNotFoundError(orderId);

    // Agrupa las líneas pendientes por fulfillment order (una por ubicación).
    const groups = new Map<string, { id: string; quantity: number }[]>();
    for (const lineId of lineIds) {
      let found = false;
      for (const fo of data.order.fulfillmentOrders.nodes) {
        const item = fo.lineItems.nodes.find(
          (i) => i.lineItem.id === lineId && i.remainingQuantity > 0,
        );
        if (item) {
          groups.set(fo.id, [
            ...(groups.get(fo.id) ?? []),
            { id: item.id, quantity: item.remainingQuantity },
          ]);
          found = true;
          break;
        }
      }
      if (!found) {
        throw new ShopifyUserError([
          {
            field: ["lineItemId"],
            message: `Line item ${lineId} not found or already fulfilled`,
          },
        ]);
      }
    }
    for (const [fulfillmentOrderId, items] of groups) {
      const result = await this.client.request<{
        fulfillmentCreate: { userErrors: UserErrors };
      }>(FULFILLMENT_CREATE, {
        fulfillment: {
          notifyCustomer: false,
          lineItemsByFulfillmentOrder: [
            { fulfillmentOrderId, fulfillmentOrderLineItems: items },
          ],
        },
      });
      assertNoUserErrors(result.fulfillmentCreate.userErrors);
    }
    return this.getOrder(orderId);
  }
}
