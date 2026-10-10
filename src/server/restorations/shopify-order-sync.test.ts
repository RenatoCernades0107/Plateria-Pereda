import { beforeEach, describe, expect, it } from "vitest";

import type { OrderPiece } from "@/domain/shopify-order";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import type { SyncJob } from "@/server/shopify-sync/jobs";

import {
  orderJobHandlers,
  type OrderContext,
  type OrderSyncRepository,
} from "./shopify-order-sync";

const job = (kind: string): SyncJob => ({
  id: 1,
  kind,
  entityTable: "restorations",
  entityId: "r1",
  payload: {},
  attempts: 0,
  maxAttempts: 8,
});

const piece = (n: number, extra: Partial<OrderPiece> = {}): OrderPiece => ({
  id: `p${n}`,
  code: `RES-00007-${n}`,
  priceCents: 10000 * n,
  status: "aprobada",
  approved: true,
  ...extra,
});

function memoryRepo(ctx: OrderContext) {
  const saved = {
    order: null as { id: string; name: string } | null,
    lines: new Map<string, string | null>(),
  };
  const repo: OrderSyncRepository = {
    async getOrderContext(id) {
      return id === ctx.id ? ctx : null;
    },
    async saveOrder(_id, order) {
      saved.order = order;
      ctx.shopifyOrderId = order.id;
    },
    async saveLineIds(lines) {
      for (const l of lines) saved.lines.set(l.pieceId, l.lineId);
    },
  };
  return { repo, saved };
}

const APP_URL = () => "https://sistema.pereda.pe/";

describe("handlers de la orden de Shopify (Fase 9)", () => {
  const gateway = new FakeShopifyGateway();
  let ctx: OrderContext;

  beforeEach(async () => {
    fakeShopify.reset();
    const customer = await gateway.createCustomer({
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@correo.pe",
      phone: null,
    });
    ctx = {
      id: "r1",
      code: "RES-00007",
      shopifyOrderId: null,
      customerId: customer.id,
      companyLocationId: null,
      customerPending: false,
      pieces: [piece(1), piece(2), piece(3, { status: "anulada" })],
    };
  });

  const orders = () => fakeShopify.snapshot().orders;

  it("order.create: una línea por pieza cobrada, etiquetas y nota con el enlace", async () => {
    const { repo, saved } = memoryRepo(ctx);
    const result = await orderJobHandlers(repo, APP_URL)["order.create"]!(
      job("order.create"),
      gateway,
    );
    const [order] = orders();
    expect(order?.lines.map((l) => [l.title, l.price])).toEqual([
      ["Restauración RES-00007-1", "100.00"],
      ["Restauración RES-00007-2", "200.00"],
    ]);
    expect(order?.tags).toEqual(["restauracion", "RES-00007"]);
    expect(order?.note).toBe(
      "Restauración RES-00007: https://sistema.pereda.pe/restauraciones/r1",
    );
    expect(saved.order).toEqual({ id: order?.id, name: "#1001" });
    expect(saved.lines.get("p1")).toBe(order?.lines[0]?.id);
    expect(saved.lines.get("p3")).toBeNull();
    expect(result).toMatchObject({ orderName: "#1001", existing: false });
  });

  it("order.create es idempotente: si la orden ya existe (corte), no la duplica", async () => {
    const handlers = orderJobHandlers(memoryRepo(ctx).repo, APP_URL);
    await handlers["order.create"]!(job("order.create"), gateway);
    ctx.shopifyOrderId = null; // el corte fue antes de guardar el id
    const result = await handlers["order.create"]!(
      job("order.create"),
      gateway,
    );
    expect(orders()).toHaveLength(1);
    expect(result).toMatchObject({ existing: true });
  });

  it("order.create espera a que el cliente esté en Shopify", async () => {
    ctx.customerPending = true;
    await expect(
      orderJobHandlers(memoryRepo(ctx).repo, APP_URL)["order.create"]!(
        job("order.create"),
        gateway,
      ),
    ).rejects.toBeInstanceOf(ShopifyUnavailableError);
  });

  it("order.create: empresa sin contacto en Shopify es un error que no se reintenta", async () => {
    ctx.customerId = null;
    await expect(
      orderJobHandlers(memoryRepo(ctx).repo, APP_URL)["order.create"]!(
        job("order.create"),
        gateway,
      ),
    ).rejects.toBeInstanceOf(ShopifyUserError);
  });

  it("order.create prepara las piezas que ya se entregaron", async () => {
    ctx.pieces[0]!.status = "entregada";
    await orderJobHandlers(memoryRepo(ctx).repo, APP_URL)["order.create"]!(
      job("order.create"),
      gateway,
    );
    expect(orders()[0]?.lines.map((l) => l.fulfilled)).toEqual([true, false]);
  });

  it("order.edit concilia: quita anuladas, ajusta precios y agrega aprobadas (P12)", async () => {
    const { repo, saved } = memoryRepo(ctx);
    const handlers = orderJobHandlers(repo, APP_URL);
    await handlers["order.create"]!(job("order.create"), gateway);

    ctx.pieces = [
      piece(1, { priceCents: 15050 }),
      piece(2, { status: "anulada" }),
      piece(3, { status: "anulada" }),
      piece(4),
    ];
    const result = await handlers["order.edit"]!(job("order.edit"), gateway);
    expect(result).toMatchObject({ added: 1, removed: 1, repriced: 1 });
    expect(
      orders()[0]
        ?.lines.map((l) => [l.title, l.price])
        .sort(),
    ).toEqual([
      ["Restauración RES-00007-1", "150.50"],
      ["Restauración RES-00007-4", "400.00"],
    ]);
    expect(orders()[0]?.financials.total).toBe("550.50");
    expect(saved.lines.get("p2")).toBeNull();

    // Repetirlo no cambia nada.
    await expect(
      handlers["order.edit"]!(job("order.edit"), gateway),
    ).resolves.toMatchObject({ unchanged: true });
  });

  it("order.edit sin orden aún creada se reintenta", async () => {
    await expect(
      orderJobHandlers(memoryRepo(ctx).repo, APP_URL)["order.edit"]!(
        job("order.edit"),
        gateway,
      ),
    ).rejects.toBeInstanceOf(ShopifyUnavailableError);
  });

  it("order.fulfill marca como preparadas las piezas entregadas, una sola vez (P44)", async () => {
    const handlers = orderJobHandlers(memoryRepo(ctx).repo, APP_URL);
    await handlers["order.create"]!(job("order.create"), gateway);
    ctx.pieces[1]!.status = "entregada";
    await expect(
      handlers["order.fulfill"]!(job("order.fulfill"), gateway),
    ).resolves.toMatchObject({ fulfilled: 1 });
    expect(orders()[0]?.lines.map((l) => l.fulfilled)).toEqual([false, true]);
    await expect(
      handlers["order.fulfill"]!(job("order.fulfill"), gateway),
    ).resolves.toMatchObject({ fulfilled: 0 });
  });
});
