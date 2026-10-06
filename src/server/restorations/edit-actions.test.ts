import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  update: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  result: {
    data: [{ id: "r1", restoration_id: "r1" }] as object[] | null,
    error: null as { code: string; message?: string } | null,
  },
  insertError: null as { code: string; message?: string } | null,
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "ventas" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (row: object) => {
        mocks.update(row);
        const chain = {
          eq: (column: string, value: unknown) => {
            mocks.eq(column, value);
            return chain;
          },
          select: async () => mocks.result,
        };
        return chain;
      },
      insert: async (row: object) => {
        mocks.insert(row);
        return { error: mocks.insertError };
      },
    }),
  }),
}));
vi.mock("./create", () => ({ createRestorationRecord: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const { addPiece, updatePiece, updateRestoration } = await import("./actions");

const piece = {
  workshopId: null,
  description: "Fuente",
  measure: "",
  material: { id: null, name: "Plata" },
  service: { id: null, name: "" },
  weight: "",
  price: "1,300",
  notes: "",
};

describe("edición de restauraciones", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.update, mocks.insert, mocks.eq, mocks.revalidate])
      fn.mockReset();
    mocks.result = { data: [{ id: "r1", restoration_id: "r1" }], error: null };
    mocks.insertError = null;
  });

  it("updateRestoration guarda contacto, tipo, % y notas; el % solo en A cuenta", async () => {
    expect(
      await updateRestoration("r1", {
        contactId: null,
        paymentType: "credito",
        depositPercent: "50",
        notes: "Nota",
      }),
    ).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({
      contact_id: null,
      payment_type: "credito",
      deposit_percent: null,
      notes: "Nota",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/restauraciones/r1");

    expect(
      await updateRestoration("r1", {
        contactId: null,
        paymentType: "a_cuenta",
        depositPercent: "0",
        notes: "",
      }),
    ).toEqual({ error: "Revisa los datos ingresados." });
  });

  it("updatePiece convierte el precio y muestra las reglas de la BD", async () => {
    expect(await updatePiece("p1", piece)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ price: 1300, material_name: "Plata" }),
    );
    expect(mocks.update.mock.calls[0]![0]).not.toHaveProperty("arrived_at");

    mocks.result = {
      data: null,
      error: { code: "23514", message: "Una pieza anulada no se puede editar" },
    };
    expect(await updatePiece("p1", piece)).toEqual({
      error: "Una pieza anulada no se puede editar",
    });
    mocks.result = { data: [], error: null };
    expect(await updatePiece("p1", piece)).toEqual({
      error: "La pieza no existe.",
    });
    expect(await updatePiece("p1", { ...piece, description: "" })).toEqual({
      error: "Revisa los datos de la pieza.",
    });
  });

  it("addPiece agrega la pieza (la llegada la fija la BD según el origen, P48)", async () => {
    expect(await addPiece("r1", piece)).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ restoration_id: "r1", price: 1300 }),
    );
    expect(mocks.insert.mock.calls[0]![0]).not.toHaveProperty("arrived_at");
    mocks.insertError = {
      code: "23514",
      message: "No se agregan piezas a una restauración completada o anulada",
    };
    expect(await addPiece("r1", piece)).toEqual({
      error: "No se agregan piezas a una restauración completada o anulada",
    });
  });

  it("exige permiso", async () => {
    mocks.forbidden = true;
    await expect(updatePiece("p1", piece)).rejects.toThrow("FORBIDDEN");
    await expect(addPiece("r1", piece)).rejects.toThrow("FORBIDDEN");
  });
});
