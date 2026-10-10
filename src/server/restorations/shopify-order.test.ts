import { beforeEach, describe, expect, it } from "vitest";

import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import type { SyncJob } from "@/server/shopify-sync/jobs";

import {
  buildOrderInput,
  lineIdsByPiece,
  orderBuyer,
  restorationOrderHandlers,
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
  pricesIncludeIgv: true,
  shopifyOrderId: null,
  shopifyOrderName: null,
  pieces: [
    {
      id: "p2",
      code: "RES-00001-2",
      number: 2,
      priceCents: 50_00,
      status: "enviada_taller",
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

function memoryRepo(data: OrderRestoration | null) {
  const lineUpdates = new Map<string, string | null>();
  const saved: {
    order: { id: string; name: string };
    lineIds: Record<string, string>;
  }[] = [];
  const repo: RestorationOrderRepository = {
    getOrderData: async () => data,
    saveOrder: async (_id, order, lineIds) => {
      saved.push({ order, lineIds });
      if (data) {
        data.shopifyOrderId = order.id;
        data.shopifyOrderName = order.name;
      }
    },
    saveLineIds: async (lines) => {
      for (const l of lines) lineUpdates.set(l.pieceId, l.lineId);
    },
  };
  return { repo, saved, lineUpdates };
}

describe("buildOrderInput", () => {
  it("una línea por pieza que se cobra, en orden, con etiquetas y enlace", () => {
    expect(buildOrderInput(restoration(), APP_URL)).toEqual({
      customerId: "gid://shopify/Customer/1",
      lines: [
        { title: "Restauración RES-00001-1", price: "1200.50", quantity: 1 },
        { title: "Restauración RES-00001-2", price: "50.00", quantity: 1 },
      ],
      tags: ["restauracion", "RES-00001"],
      note: "Restauración RES-00001: https://pereda.example/restauraciones/r1",
    });
  });

  it("sin IGV incluido, cada línea lleva el 18 % (P13)", () => {
    const input = buildOrderInput(
      restoration({ pricesIncludeIgv: false }),
      APP_URL,
    );
    expect(input.lines.map((l) => l.price)).toEqual(["1416.59", "59.00"]);
  });
});

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

describe("lineIdsByPiece", () => {
  it("relaciona cada pieza con su línea por el título", () => {
    expect(
      lineIdsByPiece(restoration().pieces, {
        lines: [
          {
            id: "L1",
            title: "Restauración RES-00001-1",
            price: "1",
            quantity: 1,
            fulfilled: false,
          },
          {
            id: "L2",
            title: "Restauración RES-00001-2",
            price: "1",
            quantity: 1,
            fulfilled: false,
          },
        ],
      }),
    ).toEqual({ p1: "L1", p2: "L2" });
  });
});

describe("order.create", () => {
  const gateway = new FakeShopifyGateway();
  let customerId: string;

  beforeEach(async () => {
    fakeShopify.reset();
    customerId = (
      await gateway.createCustomer({ firstName: "Ana", lastName: "Pérez" })
    ).id;
  });

  const withCustomer = (overrides: Partial<OrderRestoration> = {}) =>
    restoration({
      client: {
        kind: "persona",
        shopifyCustomerId: customerId,
        shopifyCompanyLocationId: null,
      },
      ...overrides,
    });

  it("crea la orden y guarda su id, su número y las líneas", async () => {
    const { repo, saved } = memoryRepo(withCustomer());
    const handlers = restorationOrderHandlers(repo, () => APP_URL);
    const result = await handlers["order.create"]!(job, gateway);

    const [order] = fakeShopify.snapshot().orders;
    expect(order).toMatchObject({
      customerId,
      tags: ["restauracion", "RES-00001"],
      financials: { total: "1250.50" },
    });
    expect(result).toEqual({
      shopifyOrderId: order!.id,
      shopifyOrderName: order!.name,
      linked: false,
    });
    expect(saved).toEqual([
      {
        order: { id: order!.id, name: order!.name },
        lineIds: {
          p1: order!.lines[0]!.id,
          p2: order!.lines[1]!.id,
        },
      },
    ]);
  });

  it("si la orden ya existe con la etiqueta, la vincula sin crear otra", async () => {
    const first = memoryRepo(withCustomer());
    await restorationOrderHandlers(first.repo, () => APP_URL)["order.create"]!(
      job,
      gateway,
    );
    // Un corte después de crearla y antes de guardarla: el reintento la encuentra.
    const retry = memoryRepo(withCustomer());
    const result = await restorationOrderHandlers(retry.repo, () => APP_URL)[
      "order.create"
    ]!(job, gateway);
    expect(fakeShopify.snapshot().orders).toHaveLength(1);
    expect(result).toMatchObject({ linked: true });
    expect(retry.saved).toHaveLength(1);
  });

  it("si la restauración ya tiene orden no llama a Shopify", async () => {
    const { repo, saved } = memoryRepo(
      withCustomer({ shopifyOrderId: "gid://x", shopifyOrderName: "#1001" }),
    );
    const result = await restorationOrderHandlers(repo, () => APP_URL)[
      "order.create"
    ]!(job, gateway);
    expect(result).toEqual({
      shopifyOrderId: "gid://x",
      shopifyOrderName: "#1001",
    });
    expect(saved).toEqual([]);
    expect(fakeShopify.snapshot().orders).toEqual([]);
  });

  it("si ya no está lista (se agregó una pieza) no crea la orden", async () => {
    const data = withCustomer();
    data.pieces.push({
      id: "p4",
      code: "RES-00001-4",
      number: 4,
      priceCents: 10_00,
      status: "registrada",
      approvedAt: null,
    });
    const { repo } = memoryRepo(data);
    expect(
      await restorationOrderHandlers(repo, () => APP_URL)["order.create"]!(
        job,
        gateway,
      ),
    ).toEqual({ skipped: true });
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

  async function created() {
    const memory = memoryRepo(data);
    const handlers = restorationOrderHandlers(memory.repo, () => APP_URL);
    await handlers["order.create"]!(jobOf("order.create"), gateway);
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

  it("sin IGV incluido, el precio editado también lleva el 18 % (P13)", async () => {
    data.pricesIncludeIgv = false;
    const { handlers } = await created();
    data.pieces[1]!.priceCents = 100_00;
    await handlers["order.edit"]!(jobOf("order.edit"), gateway);
    expect(
      order()?.lines.find((l) => l.title === "Restauración RES-00001-1")?.price,
    ).toBe("118.00");
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

  it("sin orden creada, editar se reintenta", async () => {
    await expect(
      restorationOrderHandlers(memoryRepo(data).repo, () => APP_URL)[
        "order.edit"
      ]!(jobOf("order.edit"), gateway),
    ).rejects.toBeInstanceOf(ShopifyUnavailableError);
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

  it("si la orden se crea tarde, las piezas ya entregadas quedan preparadas", async () => {
    data.pieces[0]!.status = "entregada";
    await created();
    expect(order()?.lines.map((l) => l.fulfilled)).toEqual([false, true]);
  });
});
