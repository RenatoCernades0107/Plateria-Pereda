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
  const saved: {
    order: { id: string; name: string };
    lineIds: Record<string, string>;
  }[] = [];
  const repo: RestorationOrderRepository = {
    getOrderData: async () => data,
    saveOrder: async (_id, order, lineIds) => {
      saved.push({ order, lineIds });
    },
  };
  return { repo, saved };
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
