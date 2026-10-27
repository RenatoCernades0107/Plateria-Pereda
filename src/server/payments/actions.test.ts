import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as unknown[][],
  error: null as { code?: string; message?: string } | null,
  rpcError: null as { code?: string; message?: string } | null,
  missing: null as string | null,
  orderId: "gid://shopify/Order/1" as string | null,
  payments: [] as { id: string }[],
  kind: "normal" as string,
  scheduled: 0,
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => ({ id: "u1", role: "admin" }),
}));
vi.mock("@/server/shopify-sync/run", () => ({
  scheduleShopifySync: () => {
    mocks.scheduled += 1;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/restorations/requirements", () => ({
  checkRequirements: async () => mocks.missing,
}));
const client = {
  from: (table: string) => ({
    insert: async (rows: unknown) => {
      mocks.calls.push(["insert", table, rows]);
      return { error: mocks.error };
    },
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            shopify_order_id: mocks.orderId,
            kind: mocks.kind,
            payments: mocks.payments,
          },
        }),
      }),
    }),
  }),
  rpc: async (name: string, args: unknown) => {
    mocks.calls.push(["rpc", name, args]);
    return { data: null, error: mocks.rpcError };
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client }));

const {
  approveWithPayment,
  deliverWithBalance,
  refundPayment,
  registerPayment,
  resyncPayments,
} = await import("./actions");

const R = "00000000-0000-4000-8000-000000000001";
const M = "00000000-0000-4000-8000-000000000002";
const B = "00000000-0000-4000-8000-0000000000b1";
const pay = {
  paidOn: "2026-10-12",
  branchId: B,
  rows: [{ methodId: M, amountCents: 10050 }],
};

describe("acciones de pagos (11.2)", () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.error = null;
    mocks.rpcError = null;
    mocks.missing = null;
    mocks.orderId = "gid://shopify/Order/1";
    mocks.payments = [];
    mocks.kind = "normal";
    mocks.scheduled = 0;
  });

  it.each(["interno", "observado"])(
    "una guía %s no recibe pagos, reembolsos ni el adelanto al aprobar",
    async (kind) => {
      mocks.kind = kind;
      const error = {
        error:
          "Esta guía es interna u observada: no se cobra, así que no recibe pagos ni reembolsos.",
      };
      expect(await registerPayment(R, pay)).toEqual(error);
      expect(
        await refundPayment(R, {
          methodId: M,
          amountCents: 100,
          paidOn: "2026-10-12",
          reason: "x",
        }),
      ).toEqual(error);
      expect(await approveWithPayment(R, ["p1"], pay)).toEqual(error);
      expect(mocks.calls).toEqual([]);
    },
  );

  it("registra un pago por método y procesa el outbox", async () => {
    expect(await registerPayment(R, pay)).toEqual({ ok: true });
    expect(mocks.calls).toEqual([
      [
        "insert",
        "payments",
        [
          {
            restoration_id: R,
            amount: 100.5,
            payment_method_id: M,
            method_name: "-",
            branch_id: B,
            paid_on: "2026-10-12",
          },
        ],
      ],
    ]);
    expect(mocks.scheduled).toBe(1);
  });

  it("valida los datos y traduce los errores de la BD", async () => {
    expect(
      await registerPayment(R, { paidOn: "x", branchId: B, rows: [] }),
    ).toHaveProperty("error");
    expect(await registerPayment("x", pay)).toHaveProperty("error");
    mocks.error = {
      code: "23514",
      message: "El monto supera el saldo pendiente",
    };
    expect(await registerPayment(R, pay)).toEqual({
      error: "El monto supera el saldo pendiente",
    });
    mocks.error = { code: "XX000", message: "interno" };
    expect(await registerPayment(R, pay)).toEqual({
      error: "No se pudo registrar el pago.",
    });
  });

  it("aprueba y registra el adelanto en el mismo paso", async () => {
    expect(await approveWithPayment(R, ["p1"], pay)).toEqual({ ok: true });
    expect(mocks.calls.map((c) => c[1])).toEqual([
      "change_piece_status",
      "payments",
    ]);
    mocks.calls = [];
    expect(await approveWithPayment(R, ["p1"], null)).toEqual({ ok: true });
    expect(mocks.calls).toHaveLength(1);
    expect(
      await approveWithPayment(R, ["p1"], {
        paidOn: "",
        branchId: B,
        rows: [],
      }),
    ).toHaveProperty("error");
  });

  it("no aprueba ni entrega si faltan campos obligatorios (K10)", async () => {
    mocks.missing =
      "Falta el precio de venta de P-1 para pasarla a «Aprobada».";
    expect(await approveWithPayment(R, ["p1"], pay)).toEqual({
      error: mocks.missing,
    });
    expect(await deliverWithBalance(R, ["p1"], null)).toEqual({
      error: mocks.missing,
    });
    expect(mocks.calls).toEqual([]);
  });

  it("si falla aprobar no registra el pago; si falla el pago, avisa", async () => {
    mocks.rpcError = { code: "42501", message: "Tu rol no puede" };
    expect(await approveWithPayment(R, ["p1"], pay)).toEqual({
      error: "Tu rol no puede",
    });
    mocks.rpcError = null;
    mocks.error = { code: "XX000" };
    expect(await approveWithPayment(R, ["p1"], pay)).toEqual({
      error:
        "Se aprobó, pero no se pudo registrar el pago. Regístralo desde Pagos.",
    });
  });

  it("el reembolso exige motivo y queda como reembolso", async () => {
    const refund = {
      methodId: M,
      amountCents: 500,
      paidOn: "2026-10-12",
      reason: " ",
    };
    expect(await refundPayment(R, refund)).toHaveProperty("error");
    expect(
      await refundPayment(R, { ...refund, reason: "Cobro de más" }),
    ).toEqual({ ok: true });
    expect(mocks.calls[0]![2]).toMatchObject({
      kind: "reembolso",
      amount: 5,
      reason: "Cobro de más",
    });
    mocks.error = { code: "XX000" };
    expect(await refundPayment(R, { ...refund, reason: "x" })).toEqual({
      error: "No se pudo registrar el reembolso.",
    });
  });

  it("entrega con saldo confirmándolo (P45)", async () => {
    expect(await deliverWithBalance(null, [], null)).toHaveProperty("error");
    expect(await deliverWithBalance(R, ["p1"], "ok")).toEqual({ ok: true });
    expect(mocks.calls[0]).toEqual([
      "rpc",
      "deliver_pieces_with_balance",
      { p_piece_ids: ["p1"], p_note: "ok" },
    ]);
    mocks.rpcError = { code: "XX000" };
    expect(await deliverWithBalance(null, ["p1"], null)).toEqual({
      error: "No se pudo entregar.",
    });
  });

  it("resincroniza con la orden de piezas o con pagos (11.4)", async () => {
    expect(await resyncPayments("x")).toHaveProperty("error");
    expect(await resyncPayments(R)).toEqual({ ok: true });
    expect(mocks.calls[0]).toEqual([
      "rpc",
      "enqueue_payment_sync",
      { p_restoration_id: R },
    ]);
    mocks.rpcError = { code: "XX000" };
    expect(await resyncPayments(R)).toEqual({
      error: "No se pudo resincronizar los pagos.",
    });
    mocks.orderId = null;
    expect(await resyncPayments(R)).toEqual({
      error: "La restauración aún no tiene pagos en Shopify.",
    });
    // Un pedido por pago: sin orden de piezas, con pagos.
    mocks.rpcError = null;
    mocks.payments = [{ id: "pay1" }];
    expect(await resyncPayments(R)).toEqual({ ok: true });
  });

  it("el reembolso dice qué pago devuelve", async () => {
    expect(
      await refundPayment(R, {
        paymentId: M,
        methodId: M,
        amountCents: 500,
        paidOn: "2026-10-12",
        reason: "Cobro de más",
      }),
    ).toEqual({ ok: true });
    expect(mocks.calls[0]![2]).toMatchObject({
      kind: "reembolso",
      refunded_payment_id: M,
    });
  });
});
