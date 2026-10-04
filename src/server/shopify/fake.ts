import {
  ShopifyAuthError,
  ShopifyError,
  ShopifyNotFoundError,
  ShopifyUnavailableError,
  ShopifyUserError,
} from "./errors";
import type { ShopifyGateway } from "./gateway";
import { fromCents, toCents } from "./money";
import type {
  CustomerInput,
  CustomLine,
  FinancialStatus,
  OrderFinancials,
  Page,
  PageOptions,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyOrderLine,
  ShopifyProduct,
} from "./types";

type FakeOrder = ShopifyOrder & {
  customerId: string;
  note: string;
  /** Pagos (positivos) y reembolsos (negativos) en céntimos. */
  transactions: { cents: number; gateway: string }[];
};

export type FailureKind = "unavailable" | "user" | "auth";
export type GatewayMethod = keyof ShopifyGateway;

type FakeState = {
  seq: number;
  customers: Map<string, ShopifyCustomer>;
  orders: Map<string, FakeOrder>;
  products: ShopifyProduct[];
  failures: Map<GatewayMethod, ShopifyError[]>;
  /** Claves de idempotencia de reembolsos ya usadas. */
  idempotency: Map<string, unknown>;
  calls: { method: GatewayMethod; args: unknown[] }[];
};

const SEED_PRODUCTS: ShopifyProduct[] = [
  {
    id: "gid://shopify/Product/1001",
    title: "Fuente ovalada de plata 950",
    description: "Fuente labrada a mano.",
    imageUrl: null,
    variants: [
      {
        id: "gid://shopify/ProductVariant/2001",
        title: "Mediana",
        price: "1200.00",
        sku: "FUE-950-M",
        imageUrl: null,
      },
      {
        id: "gid://shopify/ProductVariant/2002",
        title: "Grande",
        price: "1850.00",
        sku: "FUE-950-G",
        imageUrl: null,
      },
    ],
  },
  {
    id: "gid://shopify/Product/1002",
    title: "Juego de cubiertos de plata",
    description: "Doce piezas.",
    imageUrl: null,
    variants: [
      {
        id: "gid://shopify/ProductVariant/2003",
        title: "Default Title",
        price: "2400.00",
        sku: "CUB-12",
        imageUrl: null,
      },
    ],
  },
  {
    id: "gid://shopify/Product/1003",
    title: "Aretes de plata con filigrana",
    description: "",
    imageUrl: null,
    variants: [
      {
        id: "gid://shopify/ProductVariant/2004",
        title: "Default Title",
        price: "180.00",
        sku: null,
        imageUrl: null,
      },
    ],
  },
];

function createState(): FakeState {
  return {
    seq: 0,
    customers: new Map(),
    orders: new Map(),
    products: structuredClone(SEED_PRODUCTS),
    failures: new Map(),
    idempotency: new Map(),
    calls: [],
  };
}

// En globalThis: las rutas y acciones del servidor de desarrollo comparten la misma tienda.
const globalStore = globalThis as typeof globalThis & {
  __fakeShopify?: FakeState;
};

function state(): FakeState {
  globalStore.__fakeShopify ??= createState();
  return globalStore.__fakeShopify;
}

/** Control del Shopify falso para tests y para /api/test/shopify. */
export const fakeShopify = {
  reset() {
    globalStore.__fakeShopify = createState();
  },
  /** La próxima llamada a `method` falla con ese tipo de error. */
  failNext(method: GatewayMethod, kind: FailureKind, message?: string) {
    const error =
      kind === "unavailable"
        ? new ShopifyUnavailableError(message ?? "Shopify no responde")
        : kind === "auth"
          ? new ShopifyAuthError(message ?? "Credenciales inválidas")
          : new ShopifyUserError([
              { field: null, message: message ?? "Datos rechazados" },
            ]);
    const queue = state().failures.get(method) ?? [];
    state().failures.set(method, [...queue, error]);
  },
  snapshot() {
    const s = state();
    return {
      customers: [...s.customers.values()],
      orders: [...s.orders.values()].map((o) => ({
        ...o,
        financials: financials(o),
      })),
      calls: s.calls,
    };
  },
};

function nextId(kind: string) {
  const s = state();
  s.seq += 1;
  return `gid://shopify/${kind}/${9000 + s.seq}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{6,14}$/;

function validateCustomer(input: Partial<CustomerInput>, ignoreId?: string) {
  const errors: { field: string[]; message: string }[] = [];
  const others = [...state().customers.values()].filter(
    (c) => c.id !== ignoreId,
  );
  if (input.email) {
    if (!EMAIL.test(input.email))
      errors.push({ field: ["email"], message: "Email is invalid" });
    else if (others.some((c) => c.email === input.email!.toLowerCase()))
      errors.push({
        field: ["email"],
        message: "Email has already been taken",
      });
  }
  if (input.phone) {
    if (!PHONE.test(input.phone))
      errors.push({ field: ["phone"], message: "Phone is invalid" });
    else if (others.some((c) => c.phone === input.phone))
      errors.push({
        field: ["phone"],
        message: "Phone has already been taken",
      });
  }
  if (errors.length) throw new ShopifyUserError(errors);
}

function paginate<T>(
  items: T[],
  { first = 20, after = null }: PageOptions = {},
): Page<T> {
  const start = after ? Number(Buffer.from(after, "base64url").toString()) : 0;
  const slice = items.slice(start, start + first);
  const end = start + slice.length;
  return {
    items: slice,
    pageInfo: {
      hasNextPage: end < items.length,
      endCursor: slice.length
        ? Buffer.from(String(end)).toString("base64url")
        : null,
    },
  };
}

function totalCents(order: FakeOrder) {
  return order.lines.reduce((sum, l) => sum + toCents(l.price) * l.quantity, 0);
}

function financials(order: FakeOrder): OrderFinancials {
  const total = totalCents(order);
  const paid = order.transactions
    .filter((t) => t.cents > 0)
    .reduce((s, t) => s + t.cents, 0);
  const refunded = -order.transactions
    .filter((t) => t.cents < 0)
    .reduce((s, t) => s + t.cents, 0);
  const received = paid - refunded;
  let status: FinancialStatus;
  if (refunded > 0 && received <= 0) status = "REFUNDED";
  else if (refunded > 0) status = "PARTIALLY_REFUNDED";
  else if (received === 0) status = "PENDING";
  else if (received < total) status = "PARTIALLY_PAID";
  else status = "PAID";
  return {
    id: order.id,
    name: order.name,
    financialStatus: status,
    total: fromCents(total),
    received: fromCents(received),
    outstanding: fromCents(Math.max(total - received, 0)),
  };
}

function publicOrder(order: FakeOrder): ShopifyOrder {
  return {
    id: order.id,
    name: order.name,
    tags: [...order.tags],
    lines: order.lines.map((l) => ({ ...l })),
  };
}

function toLine(line: CustomLine): ShopifyOrderLine {
  if (line.quantity < 1) {
    throw new ShopifyUserError([
      { field: ["quantity"], message: "Quantity must be at least 1" },
    ]);
  }
  toCents(line.price);
  return { id: nextId("LineItem"), ...line, fulfilled: false };
}

function getOrder(id: string) {
  const order = state().orders.get(id);
  if (!order) throw new ShopifyNotFoundError(id);
  return order;
}

/** Adaptador en memoria con las mismas reglas visibles que la tienda real. */
export class FakeShopifyGateway implements ShopifyGateway {
  private track(method: GatewayMethod, args: unknown[]) {
    const s = state();
    s.calls.push({ method, args: structuredClone(args) });
    const queue = s.failures.get(method);
    const failure = queue?.shift();
    if (failure) throw failure;
  }

  async createCustomer(input: CustomerInput) {
    this.track("createCustomer", [input]);
    if (!input.firstName && !input.lastName && !input.email && !input.phone) {
      throw new ShopifyUserError([
        {
          field: null,
          message: "Customer must have a name, phone number or email address",
        },
      ]);
    }
    validateCustomer(input);
    const customer: ShopifyCustomer = {
      id: nextId("Customer"),
      firstName: input.firstName,
      lastName: input.lastName,
      displayName:
        `${input.firstName} ${input.lastName}`.trim() ||
        input.email ||
        input.phone ||
        "",
      email: input.email?.toLowerCase() || null,
      phone: input.phone || null,
      note: input.note ?? "",
      updatedAt: new Date().toISOString(),
    };
    state().customers.set(customer.id, customer);
    return { ...customer };
  }

  async updateCustomer(id: string, input: Partial<CustomerInput>) {
    this.track("updateCustomer", [id, input]);
    const current = state().customers.get(id);
    if (!current) throw new ShopifyNotFoundError(id);
    validateCustomer(input, id);
    const next: ShopifyCustomer = {
      ...current,
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.email !== undefined && {
        email: input.email?.toLowerCase() || null,
      }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.note !== undefined && { note: input.note }),
      updatedAt: new Date().toISOString(),
    };
    next.displayName =
      `${next.firstName} ${next.lastName}`.trim() ||
      next.email ||
      next.phone ||
      "";
    state().customers.set(id, next);
    return { ...next };
  }

  async searchCustomers(query: string, options?: PageOptions) {
    this.track("searchCustomers", [query, options]);
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const matches = [...state().customers.values()].filter(
      (c) =>
        !q ||
        c.displayName.toLowerCase().includes(q) ||
        c.email?.includes(q) ||
        (digits.length >= 3 && c.phone?.replace(/\D/g, "").includes(digits)),
    );
    return paginate(
      matches.map((c) => ({ ...c })),
      options,
    );
  }

  async getCustomer(id: string) {
    this.track("getCustomer", [id]);
    const customer = state().customers.get(id);
    return customer ? { ...customer } : null;
  }

  async createOrder(input: Parameters<ShopifyGateway["createOrder"]>[0]) {
    this.track("createOrder", [input]);
    if (!state().customers.has(input.customerId)) {
      throw new ShopifyUserError([
        { field: ["customerId"], message: "Customer does not exist" },
      ]);
    }
    if (input.lines.length === 0) {
      throw new ShopifyUserError([
        { field: ["lineItems"], message: "Line items can't be blank" },
      ]);
    }
    const order: FakeOrder = {
      id: nextId("Order"),
      name: `#${1000 + state().orders.size + 1}`,
      tags: [...input.tags],
      lines: input.lines.map(toLine),
      customerId: input.customerId,
      note: input.note ?? "",
      transactions: (input.payments ?? []).map((p) => ({
        cents: toCents(p.amount),
        gateway: p.gateway,
      })),
    };
    if (
      order.transactions.reduce((s, t) => s + t.cents, 0) > totalCents(order)
    ) {
      throw new ShopifyUserError([
        {
          field: ["transactions"],
          message: "Transactions exceed the order total",
        },
      ]);
    }
    state().orders.set(order.id, order);
    return publicOrder(order);
  }

  async findOrderByTag(tag: string) {
    this.track("findOrderByTag", [tag]);
    const order = [...state().orders.values()].find((o) =>
      o.tags.includes(tag),
    );
    return order ? publicOrder(order) : null;
  }

  async getOrderFinancials(orderId: string) {
    this.track("getOrderFinancials", [orderId]);
    return financials(getOrder(orderId));
  }

  async editOrder(
    orderId: string,
    edit: Parameters<ShopifyGateway["editOrder"]>[1],
  ) {
    this.track("editOrder", [orderId, edit]);
    const order = getOrder(orderId);
    const lines = order.lines.map((l) => ({ ...l }));
    for (const id of [
      ...(edit.removeLineIds ?? []),
      ...(edit.setPrices ?? []).map((p) => p.lineId),
    ]) {
      if (!lines.some((l) => l.id === id)) {
        throw new ShopifyUserError([
          { field: ["lineItemId"], message: `Line item ${id} not found` },
        ]);
      }
    }
    // Como en Shopify: cambiar el precio quita la línea y agrega otra con el mismo título.
    const repriced = (edit.setPrices ?? []).map(({ lineId, price }) => {
      const line = lines.find((l) => l.id === lineId)!;
      return toLine({ title: line.title, price, quantity: line.quantity });
    });
    const removed = new Set([
      ...(edit.removeLineIds ?? []),
      ...(edit.setPrices ?? []).map((p) => p.lineId),
    ]);
    order.lines = [
      ...lines.filter((l) => !removed.has(l.id)),
      ...repriced,
      ...(edit.addLines ?? []).map(toLine),
    ];
    return publicOrder(order);
  }

  async recordFullPayment(orderId: string, gateway: string) {
    this.track("recordFullPayment", [orderId, gateway]);
    const order = getOrder(orderId);
    const outstanding = toCents(financials(order).outstanding);
    if (outstanding === 0) {
      throw new ShopifyUserError([
        { field: null, message: "Order is already paid" },
      ]);
    }
    order.transactions.push({ cents: outstanding, gateway });
    return financials(order);
  }

  async refundPayment(
    orderId: string,
    payment: Parameters<ShopifyGateway["refundPayment"]>[1],
  ) {
    this.track("refundPayment", [orderId, payment]);
    const order = getOrder(orderId);
    // Como @idempotent en Shopify: la misma clave no reembolsa dos veces.
    if (state().idempotency.has(payment.idempotencyKey))
      return financials(order);
    const cents = toCents(payment.amount);
    if (cents <= 0 || cents > toCents(financials(order).received)) {
      throw new ShopifyUserError([
        { field: ["amount"], message: "Refund amount is invalid" },
      ]);
    }
    order.transactions.push({ cents: -cents, gateway: payment.gateway });
    state().idempotency.set(payment.idempotencyKey, true);
    return financials(order);
  }

  async fulfillLines(orderId: string, lineIds: string[]) {
    this.track("fulfillLines", [orderId, lineIds]);
    const order = getOrder(orderId);
    for (const id of lineIds) {
      const line = order.lines.find((l) => l.id === id && !l.fulfilled);
      if (!line)
        throw new ShopifyUserError([
          {
            field: ["lineItemId"],
            message: `Line item ${id} not found or already fulfilled`,
          },
        ]);
      line.fulfilled = true;
    }
    return publicOrder(order);
  }

  async searchProducts(query: string, options?: PageOptions) {
    this.track("searchProducts", [query, options]);
    const q = query.trim().toLowerCase();
    const matches = state()
      .products.filter((p) => !q || p.title.toLowerCase().includes(q))
      .map((p) => {
        const prices = p.variants.map((v) => toCents(v.price));
        return {
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl,
          minPrice: fromCents(Math.min(...prices)),
          maxPrice: fromCents(Math.max(...prices)),
        };
      });
    return paginate(matches, options);
  }

  async getProduct(id: string) {
    this.track("getProduct", [id]);
    const product = state().products.find((p) => p.id === id);
    return product ? structuredClone(product) : null;
  }
}
