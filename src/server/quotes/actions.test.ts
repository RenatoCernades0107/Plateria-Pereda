import { beforeEach, describe, expect, it, vi } from "vitest";

import { freeLine } from "@/domain/quote-line";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  permission: "",
  rpc: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  rpcResult: { data: "q-new" as string | null, error: null as object | null },
  updateResult: {
    data: [{ id: "q1" }] as object[] | null,
    error: null as object | null,
  },
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission = permission;
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "ventas" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: object) => {
      mocks.rpc(fn, args);
      return mocks.rpcResult;
    },
    from: () => ({
      update: (row: object) => {
        mocks.update(row);
        const chain = {
          eq: (column: string, value: unknown) => {
            mocks.eq(column, value);
            return chain;
          },
          select: async () => mocks.updateResult,
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const { changeQuoteStatus, duplicateQuote, saveQuote } =
  await import("./actions");

const ID = "44444444-4444-4444-8444-444444444444";
const input = {
  clientId: "33333333-3333-4333-8333-333333333333",
  contactId: null,
  validityDays: "15",
  notes: "Nota",
  terms: "",
  lines: [
    {
      ...freeLine("11111111-1111-4111-8111-111111111111"),
      title: "Bandeja",
      unitPrice: "100",
    },
  ],
};

beforeEach(() => {
  mocks.forbidden = false;
  mocks.rpc.mockReset();
  mocks.update.mockReset();
  mocks.revalidate.mockReset();
  mocks.rpcResult = { data: "q-new", error: null };
  mocks.updateResult = { data: [{ id: ID }], error: null };
});

describe("saveQuote", () => {
  it("guarda el borrador con save_quote y el permiso del cotizador", async () => {
    expect(await saveQuote(null, input)).toEqual({ ok: true, id: "q-new" });
    expect(mocks.permission).toBe("cotizador.usar");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_quote",
      expect.objectContaining({
        p_id: null,
        p_quote: expect.objectContaining({ validity_days: 15, notes: "Nota" }),
        p_items: [
          expect.objectContaining({ title: "Bandeja", unit_price: "100.00" }),
        ],
      }),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/cotizaciones");
  });

  it("no guarda datos inválidos", async () => {
    expect(await saveQuote(null, { ...input, lines: [] })).toEqual({
      error: "Revisa los datos de la cotización.",
    });
    expect(await saveQuote("no-es-uuid", input)).toEqual({
      error: "La cotización no existe.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("muestra las reglas de la BD y oculta los demás errores", async () => {
    mocks.rpcResult = {
      data: null,
      error: {
        code: "23514",
        message: "Solo se puede editar una cotización en borrador",
      },
    };
    expect(await saveQuote(ID, input)).toEqual({
      error: "Solo se puede editar una cotización en borrador.",
    });
    mocks.rpcResult = {
      data: null,
      error: { code: "23514", message: 'violates check constraint "x"' },
    };
    expect(await saveQuote(ID, input)).toEqual({
      error: "No se pudo guardar la cotización.",
    });
  });

  it("exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(saveQuote(null, input)).rejects.toThrow("FORBIDDEN");
  });
});

describe("changeQuoteStatus", () => {
  it("cambia el estado", async () => {
    expect(await changeQuoteStatus(ID, "emitida")).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ status: "emitida" });
    expect(mocks.eq).toHaveBeenCalledWith("id", ID);
  });

  it("avisa si la cotización no existe o la BD rechaza el cambio", async () => {
    mocks.updateResult = { data: [], error: null };
    expect(await changeQuoteStatus(ID, "aceptada")).toEqual({
      error: "La cotización no existe.",
    });
    mocks.updateResult = {
      data: null,
      error: {
        code: "23514",
        message: "La cotización necesita al menos una línea para emitirse",
      },
    };
    expect(await changeQuoteStatus(ID, "emitida")).toEqual({
      error: "La cotización necesita al menos una línea para emitirse.",
    });
  });

  it("rechaza estados desconocidos", async () => {
    expect(
      await changeQuoteStatus(ID, "vencida" as unknown as "emitida"),
    ).toEqual({ error: "No se pudo cambiar el estado." });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("duplicateQuote", () => {
  it("devuelve el id de la copia", async () => {
    expect(await duplicateQuote(ID)).toEqual({ ok: true, id: "q-new" });
    expect(mocks.rpc).toHaveBeenCalledWith("duplicate_quote", { p_id: ID });
  });

  it("avisa si no existe", async () => {
    mocks.rpcResult = {
      data: null,
      error: { code: "P0002", message: "La cotización no existe" },
    };
    expect(await duplicateQuote(ID)).toEqual({
      error: "La cotización no existe.",
    });
  });
});
