import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: "",
  insert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  insertResult: { error: null as object | null },
  updateResult: {
    data: [{ id: "x" }] as object[] | null,
    error: null as object | null,
  },
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission = permission;
    return { id: "u", role: "ventas" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (rows: object) => {
        mocks.insert(rows);
        return mocks.insertResult;
      },
      update: (row: object) => {
        mocks.update(row);
        const chain = {
          eq: () => chain,
          select: async () => mocks.updateResult,
        };
        return chain;
      },
      delete: () => {
        mocks.del();
        const chain = {
          eq: () => chain,
          select: async () => mocks.updateResult,
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const { deleteQuotePayment, registerQuotePayment, setQuotePaymentInvoice } =
  await import("./payment-actions");

const QUOTE = "44444444-4444-4444-8444-444444444444";
const PAYMENT = "55555555-5555-4555-8555-555555555555";
const METHOD = "66666666-6666-4666-8666-666666666666";

beforeEach(() => {
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.del.mockReset();
  mocks.revalidate.mockReset();
  mocks.insertResult = { error: null };
  mocks.updateResult = { data: [{ id: PAYMENT }], error: null };
});

describe("registerQuotePayment", () => {
  const input = {
    paidOn: "2026-11-10",
    rows: [{ methodId: METHOD, amountCents: 12_050 }],
    invoiceNumber: "  F001-77 ",
  };

  it("registra un pago por método con el N.º de factura limpio", async () => {
    expect(await registerQuotePayment(QUOTE, input)).toEqual({ ok: true });
    expect(mocks.permission).toBe("cotizador.usar");
    expect(mocks.insert).toHaveBeenCalledWith([
      {
        quote_id: QUOTE,
        amount: 120.5,
        payment_method_id: METHOD,
        method_name: "-",
        paid_on: "2026-11-10",
        invoice_number: "F001-77",
      },
    ]);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/cotizaciones/${QUOTE}`);
  });

  it("sin factura guarda null", async () => {
    await registerQuotePayment(QUOTE, { ...input, invoiceNumber: "" });
    expect(mocks.insert.mock.calls[0]![0][0].invoice_number).toBeNull();
  });

  it("rechaza datos inválidos sin tocar la BD", async () => {
    expect(
      await registerQuotePayment(QUOTE, { ...input, rows: [] }),
    ).toHaveProperty("error");
    expect(await registerQuotePayment("x", input)).toHaveProperty("error");
    expect(
      await registerQuotePayment(QUOTE, {
        ...input,
        invoiceNumber: "F".repeat(31),
      }),
    ).toHaveProperty("error");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("muestra la regla de la BD (el saldo)", async () => {
    mocks.insertResult = {
      error: { code: "23514", message: "El monto supera el saldo pendiente" },
    };
    expect(await registerQuotePayment(QUOTE, input)).toEqual({
      error: "El monto supera el saldo pendiente.",
    });
  });
});

describe("setQuotePaymentInvoice", () => {
  it("asigna el número de factura", async () => {
    expect(await setQuotePaymentInvoice(QUOTE, PAYMENT, " B001-2 ")).toEqual({
      ok: true,
    });
    expect(mocks.update).toHaveBeenCalledWith({ invoice_number: "B001-2" });
  });

  it("vacío quita la factura", async () => {
    await setQuotePaymentInvoice(QUOTE, PAYMENT, "  ");
    expect(mocks.update).toHaveBeenCalledWith({ invoice_number: null });
  });

  it("un pago que no existe", async () => {
    mocks.updateResult = { data: [], error: null };
    expect(await setQuotePaymentInvoice(QUOTE, PAYMENT, "F1")).toEqual({
      error: "El pago no existe.",
    });
  });
});

describe("deleteQuotePayment", () => {
  it("solo con el permiso del admin", async () => {
    expect(await deleteQuotePayment(QUOTE, PAYMENT)).toEqual({ ok: true });
    expect(mocks.permission).toBe("pagos.corregir");
    expect(mocks.del).toHaveBeenCalled();
  });

  it("rechaza ids inválidos", async () => {
    expect(await deleteQuotePayment("x", PAYMENT)).toHaveProperty("error");
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
