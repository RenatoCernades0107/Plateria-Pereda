import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  role: "admin" as "admin" | "ventas",
  update: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  result: {
    data: [
      {
        id: "00000000-0000-4000-8000-000000000004",
        restoration_id: "00000000-0000-4000-8000-000000000004",
      },
    ] as object[] | null,
    error: null as { code: string; message?: string } | null,
  },
  insertError: null as { code: string; message?: string } | null,
  rpc: vi.fn(),
  rpcError: null as { code: string; message?: string } | null,
  total: {
    data: { total: 1000, kind: "normal" } as object | null,
    error: null,
  },
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "00000000-0000-4000-8000-000000000007", role: mocks.role };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => mocks.total }),
      }),
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
      insert: (row: object) => {
        mocks.insert(row);
        return {
          select: () => ({
            single: async () => ({
              data: mocks.insertError
                ? null
                : { id: "00000000-0000-4000-8000-000000000003" },
              error: mocks.insertError,
            }),
          }),
        };
      },
    }),
    rpc: async (name: string, args: object) => {
      mocks.rpc(name, args);
      return { error: mocks.rpcError };
    },
  }),
}));
vi.mock("./create", () => ({ createRestorationRecord: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const { addPiece, updatePiece, updateRestoration } = await import("./actions");

const piece = {
  workshopId: null,
  description: "Fuente",
  measure: "",
  materials: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e"],
  services: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d70"],
  weight: "",
  price: "1,300",
  notes: "",
};

describe("edición de restauraciones", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.role = "admin";
    for (const fn of [
      mocks.update,
      mocks.insert,
      mocks.eq,
      mocks.revalidate,
      mocks.rpc,
    ])
      fn.mockReset();
    mocks.result = {
      data: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          restoration_id: "00000000-0000-4000-8000-000000000004",
        },
      ],
      error: null,
    };
    mocks.insertError = null;
    mocks.rpcError = null;
    mocks.total = { data: { total: 1000, kind: "normal" }, error: null };
  });

  it("updateRestoration guarda contacto, tipo, adelanto y notas; el adelanto solo en A cuenta", async () => {
    expect(
      await updateRestoration("00000000-0000-4000-8000-000000000004", {
        contactId: null,
        paymentType: "credito",
        depositAmount: "50",
        notes: "Nota",
      }),
    ).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({
      contact_id: null,
      payment_type: "credito",
      deposit_percent: null,
      deposit_amount: null,
      notes: "Nota",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/00000000-0000-4000-8000-000000000004",
    );

    expect(
      await updateRestoration("00000000-0000-4000-8000-000000000004", {
        contactId: null,
        paymentType: "a_cuenta",
        depositAmount: "-1",
        notes: "",
      }),
    ).toEqual({ error: "El adelanto no puede ser negativo." });
  });

  it("updateRestoration guarda el adelanto en soles y no deja superar el total", async () => {
    const edit = {
      contactId: null,
      paymentType: "a_cuenta" as const,
      notes: "",
    };
    expect(
      await updateRestoration("00000000-0000-4000-8000-000000000004", {
        ...edit,
        depositAmount: "250.50",
      }),
    ).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ deposit_amount: 250.5, deposit_percent: null }),
    );

    mocks.update.mockReset();
    expect(
      await updateRestoration("00000000-0000-4000-8000-000000000004", {
        ...edit,
        depositAmount: "1000.01",
      }),
    ).toEqual({
      error: "El adelanto no puede ser mayor que el total (S/ 1,000.00).",
    });
    expect(mocks.update).not.toHaveBeenCalled();

    // Sin precios asignados (total 0) se guarda el monto en soles.
    mocks.total = { data: { total: 0, kind: "normal" }, error: null };
    expect(
      await updateRestoration("00000000-0000-4000-8000-000000000004", {
        ...edit,
        depositAmount: "5000",
      }),
    ).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ deposit_amount: 5000 }),
    );
  });

  it("updateRestoration en una guía interna u observada no guarda tipo de pago ni adelanto", async () => {
    mocks.total = { data: { total: 0, kind: "interno" }, error: null };
    expect(
      await updateRestoration("00000000-0000-4000-8000-000000000004", {
        contactId: null,
        paymentType: "a_cuenta",
        depositAmount: "50",
        notes: "",
      }),
    ).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_type: "sin_definir",
        deposit_amount: null,
      }),
    );
  });

  it("updatePiece guarda la cantidad (vacía = 1) y la valida", async () => {
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", {
        ...piece,
        quantity: "6",
      }),
    ).toEqual({
      ok: true,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 6 }),
    );
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", piece),
    ).toEqual({ ok: true });
    expect(mocks.update.mock.calls[1]![0]).toMatchObject({ quantity: 1 });
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", {
        ...piece,
        quantity: "0",
      }),
    ).toEqual({
      error: "Revisa los datos de la pieza.",
    });
  });

  it("updatePiece convierte el precio y muestra las reglas de la BD", async () => {
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", piece),
    ).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 1300,
        material_ids: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e"],
      }),
    );
    expect(mocks.update.mock.calls[0]![0]).not.toHaveProperty("arrived_at");

    mocks.result = {
      data: null,
      error: { code: "23514", message: "Una pieza anulada no se puede editar" },
    };
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", piece),
    ).toEqual({
      error: "Una pieza anulada no se puede editar",
    });
    mocks.result = { data: [], error: null };
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", piece),
    ).toEqual({
      error: "La pieza no existe.",
    });
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", {
        ...piece,
        description: "",
      }),
    ).toEqual({
      error: "Revisa los datos de la pieza.",
    });
  });

  it("addPiece agrega la pieza (la llegada la fija la BD según el origen, P48)", async () => {
    expect(
      await addPiece("00000000-0000-4000-8000-000000000004", piece),
    ).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        restoration_id: "00000000-0000-4000-8000-000000000004",
        price: 1300,
      }),
    );
    expect(mocks.insert.mock.calls[0]![0]).not.toHaveProperty("arrived_at");
    // Sin precio pasa a Consulta como al registrar la guía (la BD decide si aplica).
    expect(mocks.rpc).toHaveBeenCalledWith("send_unpriced_to_consultation", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000003"],
    });
    mocks.rpcError = { code: "XX000" };
    expect(
      await addPiece("00000000-0000-4000-8000-000000000004", piece),
    ).toEqual({
      error: "La pieza se agregó, pero no pasó a Consulta por no tener precio.",
    });
    mocks.rpcError = null;
    mocks.insertError = {
      code: "23514",
      message: "No se agregan piezas a una restauración completada o anulada",
    };
    expect(
      await addPiece("00000000-0000-4000-8000-000000000004", piece),
    ).toEqual({
      error: "No se agregan piezas a una restauración completada o anulada",
    });
  });

  it("ventas escribe el precio de venta", async () => {
    mocks.role = "ventas";
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", piece),
    ).toEqual({ ok: true });
    expect(mocks.update.mock.calls[0]![0]).toHaveProperty("price");
    expect(
      await addPiece("00000000-0000-4000-8000-000000000004", piece),
    ).toEqual({ ok: true });
    expect(mocks.insert.mock.calls[0]![0]).toHaveProperty("price");
  });

  it("solo el admin escribe el taller; ventas no lo envía (D60)", async () => {
    const withWorkshop = {
      ...piece,
      workshopId: "00000000-0000-0000-0000-0000000000f1",
    };
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", withWorkshop),
    ).toEqual({ ok: true });
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({
      workshop_id: "00000000-0000-0000-0000-0000000000f1",
    });
    mocks.role = "ventas";
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", withWorkshop),
    ).toEqual({ ok: true });
    expect(mocks.update.mock.calls[1]![0]).not.toHaveProperty("workshop_id");
    expect(
      await addPiece("00000000-0000-4000-8000-000000000004", withWorkshop),
    ).toEqual({ ok: true });
    expect(mocks.insert.mock.calls[0]![0]).not.toHaveProperty("workshop_id");
  });

  it("el admin deja el precio sin asignar si lo vacía", async () => {
    expect(
      await updatePiece("00000000-0000-4000-8000-000000000001", {
        ...piece,
        price: "",
      }),
    ).toEqual({
      ok: true,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ price: null }),
    );
  });

  it("exige permiso", async () => {
    mocks.forbidden = true;
    await expect(
      updatePiece("00000000-0000-4000-8000-000000000001", piece),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      addPiece("00000000-0000-4000-8000-000000000004", piece),
    ).rejects.toThrow("FORBIDDEN");
  });
});
