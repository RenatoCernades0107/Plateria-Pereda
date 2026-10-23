import { beforeEach, describe, expect, it } from "vitest";

import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import { toDecimalString } from "@/domain/money";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import type { SyncJob } from "@/server/shopify-sync/jobs";

import {
  billablePieces,
  lineTitle,
  orderBuyer,
  restorationOrderHandlers,
  type OrderPayment,
  type OrderRestoration,
  type RestorationOrderRepository,
} from "./shopify-order";

const APP_URL = "https://pereda.example";
const APPROVED = "2026-10-09T15:00:00Z";

const restoration = (
  overrides: Partial<OrderRestoration> = {},
): OrderRestoration => ({
  id: "r1",
  code: "RES-00001",
  shopifyOrderId: null,
  shopifyOrderName: null,
  pieces: [
    {
      id: "p2",
      code: "RES-00001-2",
      number: 2,
      priceCents: 50_00,
      status: "aprobada",
      approvedAt: APPROVED,
    },
    {
      id: "p1",
      code: "RES-00001-1",
      number: 1,
      priceCents: 120_050,
      status: "aprobada",
      approvedAt: APPROVED,
    },
    {
      id: "p3",
      code: "RES-00001-3",
      number: 3,
      priceCents: 99_00,
      status: "anulada",
      approvedAt: null,
    },
  ],
  client: {
    kind: "persona",
    shopifyCustomerId: "gid://shopify/Customer/1",
    shopifyCompanyLocationId: null,
  },
  contact: null,
  payments: [],
  ...overrides,
});

const job: SyncJob = {
  id: 1,
  kind: "order.create",
  entityTable: "restorations",
  entityId: "r1",
  payload: {},
  attempts: 1,
  maxAttempts: 8,
};

/** Repositorio en memoria: lee y escribe en `data` (como la BD al releerla). */
function memoryRepo(
  data: OrderRestoration | null,
  /** Transacciones ya contadas (en la BD persisten entre jobs). */
  known = new Set<string>(),
) {
  const lineUpdates = new Map<string, string | null>();
  const savedOrders = new Map<string, { id: string; name: string }>();
  const repo: RestorationOrderRepository = {
    getOrderData: async () => data && structuredClone(data),
    savePaymentOrder: async (paymentId, order) => {
      if (savedOrders.has(paymentId)) return;
      savedOrders.set(paymentId, order);
      const payment = data?.payments.find((p) => p.id === paymentId);
      if (payment) {
        payment.orderId = order.id;
        payment.synced = true;
      }
    },
    saveLineIds: async (lines) => {
      for (const l of lines) lineUpdates.set(l.pieceId, l.lineId);
    },
    knownTransactions: async () => new Set(known),
    rememberTransactions: async (_id, ids) => {
      for (const id of ids) known.add(id);
    },
    importPayments: async (_id, payments) => {
      for (const p of payments) {
        known.add(p.transactionId);
        data?.payments.push({
          id: p.transactionId,
          kind: p.kind,
          amountCents: p.amountCents,
          gateway: p.methodName,
          synced: true,
          source: "shopify",
          refundedPaymentId: p.refundedPaymentId ?? null,
        });
      }
    },
    markPaymentsSynced: async (ids) => {
      for (const p of data?.payments ?? [])
        if (ids.includes(p.id)) p.synced = true;
    },
  };
  return { repo, savedOrders, lineUpdates, known };
}

describe("orderBuyer", () => {
  const company = {
    kind: "empresa" as const,
    shopifyCustomerId: null,
    shopifyCompanyLocationId: "gid://shopify/CompanyLocation/7",
  };

  it("una empresa compra con su ubicación y su contacto (P14)", () => {
    expect(
      orderBuyer({
        client: company,
        contact: { shopifyCustomerId: "gid://shopify/Customer/9" },
      }),
    ).toEqual({
      customerId: "gid://shopify/Customer/9",
      companyLocationId: "gid://shopify/CompanyLocation/7",
    });
  });

  it("espera a que el cliente, la empresa o el contacto estén en Shopify", () => {
    expect(() =>
      orderBuyer({
        client: { ...restoration().client, shopifyCustomerId: null },
        contact: null,
      }),
    ).toThrow(ShopifyUnavailableError);
    expect(() =>
      orderBuyer({
        client: { ...company, shopifyCompanyLocationId: null },
        contact: null,
      }),
    ).toThrow(ShopifyUnavailableError);
    expect(() =>
      orderBuyer({ client: company, contact: { shopifyCustomerId: null } }),
    ).toThrow(ShopifyUnavailableError);
  });

  it("una empresa sin contactos no puede comprar: error que pide agregar uno", () => {
    expect(() => orderBuyer({ client: company, contact: null })).toThrow(
      ShopifyUserError,
    );
  });
});

describe("order.create", () => {
  const gateway = new FakeShopifyGateway();
  beforeEach(() => fakeShopify.reset());

  it("ya no se crea la orden con las piezas: el job queda omitido", async () => {
    const { repo } = memoryRepo(restoration());
    await expect(
      restorationOrderHandlers(repo, () => APP_URL)["order.create"]!(
        job,
        gateway,
      ),
    ).resolves.toEqual({ skipped: true });
    expect(fakeShopify.snapshot().orders).toEqual([]);
  });

  it("una guía antigua con su orden devuelve la que tiene", async () => {
    const { repo } = memoryRepo(
      restoration({ shopifyOrderId: "gid://x", shopifyOrderName: "#1001" }),
    );
    await expect(
      restorationOrderHandlers(repo, () => APP_URL)["order.create"]!(
        job,
        gateway,
      ),
    ).resolves.toEqual({
      shopifyOrderId: "gid://x",
      shopifyOrderName: "#1001",
    });
    expect(fakeShopify.snapshot().orders).toEqual([]);
  });

  it("si la restauración no existe falla sin reintentos", async () => {
    const { repo } = memoryRepo(null);
    await expect(
      restorationOrderHandlers(repo, () => APP_URL)["order.create"]!(
        job,
        gateway,
      ),
    ).rejects.toBeInstanceOf(ShopifyUserError);
  });
});

describe("order.edit y order.fulfill (Pasos 9.2 y 9.3)", () => {
  const gateway = new FakeShopifyGateway();
  const jobOf = (kind: string): SyncJob => ({ ...job, kind });
  let data: OrderRestoration;

  beforeEach(async () => {
    fakeShopify.reset();
    const customer = await gateway.createCustomer({
      firstName: "Ana",
      lastName: "Pérez",
    });
    data = restoration({
      client: {
        kind: "persona",
        shopifyCustomerId: customer.id,
        shopifyCompanyLocationId: null,
      },
    });
  });

  const order = () => fakeShopify.snapshot().orders[0];

  /** Una guía antigua: su orden con una línea por pieza ya está en Shopify. */
  async function created() {
    const legacy = await gateway.createOrder({
      customerId: data.client.shopifyCustomerId!,
      lines: billablePieces(data.pieces).map((p) => ({
        title: lineTitle(p.code),
        price: toDecimalString(p.priceCents),
        quantity: 1,
      })),
      tags: ["restauracion", data.code],
    });
    data.shopifyOrderId = legacy.id;
    data.shopifyOrderName = legacy.name;
    const memory = memoryRepo(data);
    const handlers = restorationOrderHandlers(memory.repo, () => APP_URL);
    return { handlers, ...memory };
  }

  it("concilia la orden: quita anuladas, ajusta precios y agrega aprobadas (P12)", async () => {
    const { handlers, lineUpdates } = await created();
    const [p2, p1] = data.pieces;
    p1!.priceCents = 130_000;
    p2!.status = "anulada";
    data.pieces.push({
      id: "p4",
      code: "RES-00001-4",
      number: 4,
      priceCents: 40_00,
      status: "aprobada",
      approvedAt: APPROVED,
    });
    await expect(
      handlers["order.edit"]!(jobOf("order.edit"), gateway),
    ).resolves.toMatchObject({ added: 1, removed: 1, repriced: 1 });
    expect(
      order()
        ?.lines.map((l) => [l.title, l.price])
        .sort(),
    ).toEqual([
      ["Restauración RES-00001-1", "1300.00"],
      ["Restauración RES-00001-4", "40.00"],
    ]);
    expect(lineUpdates.get("p2")).toBeNull();
    await expect(
      handlers["order.edit"]!(jobOf("order.edit"), gateway),
    ).resolves.toMatchObject({ unchanged: true });
  });

  it("el precio editado va a la orden tal cual, sin IGV", async () => {
    const { handlers } = await created();
    data.pieces[1]!.priceCents = 100_00;
    await handlers["order.edit"]!(jobOf("order.edit"), gateway);
    expect(
      order()?.lines.find((l) => l.title === "Restauración RES-00001-1")?.price,
    ).toBe("100.00");
  });

  it("una pieza agregada sin aprobar no entra a la orden", async () => {
    const { handlers } = await created();
    data.pieces.push({
      id: "p4",
      code: "RES-00001-4",
      number: 4,
      priceCents: 40_00,
      status: "en_consulta",
      approvedAt: null,
    });
    await expect(
      handlers["order.edit"]!(jobOf("order.edit"), gateway),
    ).resolves.toMatchObject({ unchanged: true });
  });

  it("sin orden de piezas no hay nada que editar", async () => {
    await expect(
      restorationOrderHandlers(memoryRepo(data).repo, () => APP_URL)[
        "order.edit"
      ]!(jobOf("order.edit"), gateway),
    ).resolves.toEqual({ skipped: true });
    expect(fakeShopify.snapshot().orders).toEqual([]);
  });

  it("order.fulfill prepara las piezas entregadas una sola vez (P44)", async () => {
    const { handlers } = await created();
    data.pieces[0]!.status = "entregada";
    await expect(
      handlers["order.fulfill"]!(jobOf("order.fulfill"), gateway),
    ).resolves.toMatchObject({ fulfilled: 1 });
    await expect(
      handlers["order.fulfill"]!(jobOf("order.fulfill"), gateway),
    ).resolves.toMatchObject({ fulfilled: 0 });
    expect(order()?.lines.map((l) => [l.title, l.fulfilled])).toEqual([
      ["Restauración RES-00001-1", false],
      ["Restauración RES-00001-2", true],
    ]);
  });
});

describe("un pedido de Shopify por pago (2026-10-19)", () => {
  const gateway = new FakeShopifyGateway();
  const syncJob: SyncJob = { ...job, kind: "payment.sync" };
  const fulfillJob: SyncJob = { ...job, kind: "order.fulfill" };
  let data: OrderRestoration;
  let known: Set<string>;
  const repoOf = (d = data) => memoryRepo(d, known);

  const pago = (
    id: string,
    amountCents: number,
    orderTitle: string,
    gatewayName = "Efectivo",
  ): OrderPayment => ({
    id,
    kind: "pago",
    amountCents,
    gateway: gatewayName,
    synced: false,
    source: "sistema",
    orderTitle,
    orderId: null,
    refundedPaymentId: null,
  });

  const reembolso = (
    id: string,
    amountCents: number,
    refundedPaymentId: string | null,
  ): OrderPayment => ({
    id,
    kind: "reembolso",
    amountCents,
    gateway: "Efectivo",
    synced: false,
    source: "sistema",
    orderTitle: null,
    orderId: null,
    refundedPaymentId,
  });

  beforeEach(async () => {
    fakeShopify.reset();
    known = new Set();
    const customer = await gateway.createCustomer({
      firstName: "Ana",
      lastName: "Pérez",
    });
    data = restoration({
      client: {
        kind: "persona",
        shopifyCustomerId: customer.id,
        shopifyCompanyLocationId: null,
      },
      payments: [
        pago("pay1", 300_00, "Adelanto Guía RES-00001 A1"),
        pago("pay2", 100_00, "Adelanto Guía RES-00001 A2", "Yape"),
      ],
    });
  });

  const orders = () => fakeShopify.snapshot().orders;
  const run = (memory: ReturnType<typeof memoryRepo>, j = syncJob) =>
    restorationOrderHandlers(memory.repo, () => APP_URL)[j.kind]!(j, gateway);

  it("cada pago es un pedido pagado, con su nombre como número de pedido y como línea", async () => {
    const memory = repoOf();
    await expect(run(memory)).resolves.toEqual({
      created: 2,
      refunded: 0,
      imported: 0,
    });
    expect(
      orders().map((o) => ({
        name: o.name,
        lines: o.lines.map((l) => [l.title, l.price, l.quantity]),
        tags: o.tags,
        note: o.note,
        status: o.financials.financialStatus,
      })),
    ).toEqual([
      {
        name: "Adelanto Guía RES-00001 A1",
        lines: [["Adelanto Guía RES-00001 A1", "300.00", 1]],
        tags: ["restauracion", "RES-00001", "pago-pay1"],
        note: "Guía RES-00001: https://pereda.example/restauraciones/r1",
        status: "PAID",
      },
      {
        name: "Adelanto Guía RES-00001 A2",
        lines: [["Adelanto Guía RES-00001 A2", "100.00", 1]],
        tags: ["restauracion", "RES-00001", "pago-pay2"],
        note: "Guía RES-00001: https://pereda.example/restauraciones/r1",
        status: "PAID",
      },
    ]);
    expect(orders()[1]!.transactions.map((t) => t.gateway)).toEqual(["Yape"]);
    expect([...memory.savedOrders.keys()]).toEqual(["pay1", "pay2"]);
    expect(data.payments.every((p) => p.synced)).toBe(true);
  });

  it("con el id real de un pago (UUID) la etiqueta cabe en Shopify (máx. 40)", async () => {
    const id = "6bd07cdd-cec7-4bd8-9af6-8694a1e6c932";
    data.payments = [pago(id, 50_00, "Adelanto Guía RES-00001 A1")];
    await expect(run(repoOf())).resolves.toMatchObject({ created: 1 });
    const tag = orders()[0]!.tags.at(-1)!;
    expect(tag).toBe("pago-6bd07cddcec74bd89af68694a1e6c932");
    expect(tag.length).toBeLessThanOrEqual(40);
    // Un reintento lo encuentra por esa misma etiqueta.
    data.payments[0]!.orderId = null;
    await run(repoOf());
    expect(orders()).toHaveLength(1);
  });

  it("repetir el job no crea otro pedido; un reintento tras un corte lo encuentra por su etiqueta", async () => {
    await run(repoOf());
    await expect(run(repoOf())).resolves.toMatchObject({ created: 0 });
    // Corte: Shopify creó el pedido pero el sistema no lo guardó.
    const lost = structuredClone(data);
    for (const p of lost.payments) p.orderId = null;
    const retry = repoOf(lost);
    await run(retry);
    expect(orders()).toHaveLength(2);
    expect(retry.savedOrders.get("pay1")?.id).toBe(orders()[0]!.id);
  });

  it("el saldo es otro pedido con su propio nombre", async () => {
    await run(repoOf());
    data.payments.push(pago("pay3", 850_50, "Saldo Guía RES-00001"));
    await run(repoOf());
    expect(orders().map((o) => o.name)).toEqual([
      "Adelanto Guía RES-00001 A1",
      "Adelanto Guía RES-00001 A2",
      "Saldo Guía RES-00001",
    ]);
  });

  it("los pagos de una guía antigua (sin nombre de pedido) no crean pedidos", async () => {
    data.payments = [{ ...pago("old", 50_00, ""), orderTitle: null }];
    await expect(run(repoOf())).resolves.toMatchObject({ created: 0 });
    expect(orders()).toEqual([]);
  });

  it("sin el cliente en Shopify el job se reintenta", async () => {
    data.client.shopifyCustomerId = null;
    await expect(run(repoOf())).rejects.toBeInstanceOf(ShopifyUnavailableError);
  });

  it("el reembolso se hace en el pedido del pago que devuelve, una sola vez", async () => {
    await run(repoOf());
    data.payments.push(reembolso("ref1", 40_00, "pay2"));
    await expect(run(repoOf())).resolves.toMatchObject({
      refunded: 1,
      imported: 0,
    });
    await expect(run(repoOf())).resolves.toMatchObject({
      refunded: 0,
      imported: 0,
    });
    expect(orders().map((o) => [o.name, o.financials.received])).toEqual([
      ["Adelanto Guía RES-00001 A1", "300.00"],
      ["Adelanto Guía RES-00001 A2", "60.00"],
    ]);
    expect(orders()[1]!.transactions.at(-1)?.gateway).toBe("Yape");
    expect(data.payments.find((p) => p.id === "ref1")?.synced).toBe(true);
  });

  it("un reembolso antiguo sin pago queda solo en el sistema", async () => {
    await run(repoOf());
    data.payments.push(reembolso("ref0", 10_00, null));
    await expect(run(repoOf())).resolves.toMatchObject({
      refunded: 0,
    });
    expect(data.payments.find((p) => p.id === "ref0")?.synced).toBe(true);
    expect(orders()[0]!.financials.received).toBe("300.00");
  });

  it("un reembolso hecho en Shopify entra al registro con su pago; un pago hecho allá no", async () => {
    await run(repoOf());
    fakeShopify.externalTransaction("pago-pay1", "-25.00", "cash");
    fakeShopify.externalTransaction("pago-pay2", "5.00", "cash");
    await expect(run(repoOf())).resolves.toMatchObject({ imported: 1 });
    await expect(run(repoOf())).resolves.toMatchObject({ imported: 0 });
    expect(data.payments.at(-1)).toMatchObject({
      kind: "reembolso",
      amountCents: 25_00,
      source: "shopify",
      refundedPaymentId: "pay1",
    });
  });

  it("order.fulfill prepara los pedidos solo al entregarse toda la guía", async () => {
    await run(repoOf());
    data.pieces[0]!.status = "entregada";
    await expect(run(repoOf(), fulfillJob)).resolves.toEqual({
      delivered: false,
      fulfilled: 0,
    });
    data.pieces[1]!.status = "entregada";
    await expect(run(repoOf(), fulfillJob)).resolves.toEqual({
      delivered: true,
      fulfilled: 2,
    });
    await expect(run(repoOf(), fulfillJob)).resolves.toEqual({
      delivered: true,
      fulfilled: 0,
    });
    expect(orders().flatMap((o) => o.lines.map((l) => l.fulfilled))).toEqual([
      true,
      true,
    ]);
  });

  it("un pago registrado con la guía ya entregada nace preparado", async () => {
    for (const p of data.pieces)
      if (p.status === "aprobada") p.status = "entregada";
    await run(repoOf());
    expect(orders().flatMap((o) => o.lines.map((l) => l.fulfilled))).toEqual([
      true,
      true,
    ]);
  });
});
