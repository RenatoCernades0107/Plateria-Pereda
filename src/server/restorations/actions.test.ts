import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  role: "admin" as "admin" | "ventas",
  create: vi.fn(),
  deposit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: mocks.role };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("./create", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./create")>()),
  createRestorationRecord: mocks.create,
}));
vi.mock("@/server/payments/initial-deposit", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/payments/initial-deposit")
  >()),
  recordInitialDeposit: mocks.deposit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const { createRestoration } = await import("./actions");
const { pieceToRpc, withoutSalePrices, withoutWorkshops } =
  await vi.importActual<typeof import("./create")>("./create");

const piece = {
  workshopId: null,
  description: "Fuente ovalada",
  measure: "40 cm",
  materials: [],
  services: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d70"],
  weight: "820,5",
  price: "1,200.50",
  notes: "",
};

const input = {
  clientId: "00000000-0000-0000-0000-000000000001",
  contactId: null,
  paymentType: "a_cuenta" as const,
  depositAmount: "500",
  depositMethodId: "00000000-0000-0000-0000-0000000000aa",
  depositBranchId: "00000000-0000-0000-0000-0000000000bb",
  notes: "",
  pieces: [piece],
};

describe("createRestoration", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.role = "admin";
    mocks.create.mockReset().mockResolvedValue({ id: "r1", code: "RES-00001" });
    mocks.deposit.mockReset().mockResolvedValue(true);
    mocks.revalidate.mockReset();
  });

  it("valida, registra y devuelve el código", async () => {
    expect(await createRestoration(input)).toEqual({
      ok: true,
      id: "r1",
      code: "RES-00001",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        paymentType: "a_cuenta",
        depositAmount: 50000,
        pieces: [
          expect.objectContaining({ priceCents: 120050, weightGrams: 820.5 }),
        ],
      }),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/restauraciones");
  });

  it("registra el adelanto como pago con el método y la sucursal elegidos", async () => {
    await createRestoration(input);
    expect(mocks.deposit).toHaveBeenCalledWith(
      {},
      "r1",
      "00000000-0000-0000-0000-0000000000aa",
      "00000000-0000-0000-0000-0000000000bb",
    );
  });

  it("sin adelanto no registra ningún pago", async () => {
    await createRestoration({ ...input, depositAmount: "" });
    await createRestoration({ ...input, depositAmount: "0" });
    await createRestoration({
      ...input,
      paymentType: "contado",
      depositAmount: "",
    });
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.deposit).not.toHaveBeenCalled();
  });

  it("exige el método del adelanto sin llamar a la BD", async () => {
    expect(await createRestoration({ ...input, depositMethodId: "" })).toEqual({
      error: "Elige el método con que se pagó el adelanto.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("si el adelanto no se registra, la restauración queda y avisa", async () => {
    mocks.deposit.mockResolvedValueOnce(false);
    expect(await createRestoration(input)).toEqual({
      ok: true,
      id: "r1",
      code: "RES-00001",
      warning:
        "La restauración se registró, pero no se pudo registrar el adelanto. Regístralo desde Pagos.",
    });
  });

  it("ventas registra las piezas con su precio de venta", async () => {
    mocks.role = "ventas";
    expect(await createRestoration(input)).toMatchObject({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        pieces: [expect.objectContaining({ priceCents: expect.any(Number) })],
      }),
    );
  });

  it("ventas registra las piezas sin taller: lo asignan logística y el admin (D60)", async () => {
    const withWorkshop = {
      ...input,
      pieces: [
        { ...piece, workshopId: "00000000-0000-0000-0000-0000000000f1" },
      ],
    };
    expect(await createRestoration(withWorkshop)).toMatchObject({ ok: true });
    expect(mocks.create).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        pieces: [
          expect.objectContaining({
            workshopId: "00000000-0000-0000-0000-0000000000f1",
          }),
        ],
      }),
    );
    mocks.role = "ventas";
    expect(await createRestoration(withWorkshop)).toMatchObject({ ok: true });
    expect(mocks.create).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        pieces: [expect.objectContaining({ workshopId: null })],
      }),
    );
  });

  it("rechaza datos inválidos sin llamar a la BD", async () => {
    expect(await createRestoration({ ...input, pieces: [] })).toEqual({
      error: "Revisa los datos ingresados.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("traduce los errores de la BD", async () => {
    mocks.create.mockRejectedValueOnce({ code: "23503" });
    expect(await createRestoration(input)).toEqual({
      error:
        "El cliente, el contacto o un elemento elegido ya no existe o está desactivado.",
    });
    mocks.create.mockRejectedValueOnce(new Error("red"));
    expect(await createRestoration(input)).toEqual({
      error: "No se pudo registrar la restauración.",
    });
    expect(mocks.deposit).not.toHaveBeenCalled();
  });

  it("exige permiso", async () => {
    mocks.forbidden = true;
    await expect(createRestoration(input)).rejects.toThrow("FORBIDDEN");
  });
});

describe("pieceToRpc", () => {
  it("convierte céntimos a soles; los ids de los servicios y de los materiales", () => {
    expect(
      pieceToRpc({
        workshopId: null,
        quantity: 6,
        description: "Fuente",
        measure: "",
        materials: ["m1", "m2"],
        services: ["s1", "s2"],
        weightGrams: 12.5,
        priceCents: 120050,
        urgent: true,
        notes: "",
      }),
    ).toEqual({
      workshop_id: null,
      quantity: 6,
      description: "Fuente",
      measure: "",
      material_ids: ["m1", "m2"],
      service_ids: ["s1", "s2"],
      weight_grams: "12.50",
      price: "1200.50",
      urgent: true,
      notes: "",
      quote_item_id: null,
      status: null,
      status_note: "",
    });
  });

  it("una pieza sin precio de venta va sin precio (D58)", () => {
    expect(
      pieceToRpc({
        workshopId: null,
        quantity: 1,
        description: "Fuente",
        measure: "",
        materials: [],
        services: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d70"],
        weightGrams: null,
        priceCents: null,
        urgent: false,
        notes: "",
      }).price,
    ).toBeNull();
  });

  it("pasa el estado inicial y su nota de la copia desde WhatsApp (P49)", () => {
    expect(
      pieceToRpc({
        workshopId: null,
        quantity: 1,
        description: "Fuente",
        measure: "",
        materials: [],
        services: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d70"],
        weightGrams: null,
        priceCents: 1000,
        urgent: false,
        notes: "",
        initialStatus: "en_consulta",
        statusNote: "Consultar al taller",
      }),
    ).toMatchObject({
      status: "en_consulta",
      status_note: "Consultar al taller",
    });
  });
});

describe("withoutSalePrices (D58)", () => {
  const base = {
    workshopId: null,
    quantity: 1,
    description: "Fuente",
    measure: "",
    materials: [],
    services: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d70"],
    weightGrams: null,
    urgent: false,
    notes: "",
  };

  it("quita el precio de venta de las piezas", () => {
    expect(withoutSalePrices([{ ...base, priceCents: 1000 }])).toEqual([
      { ...base, priceCents: null },
    ]);
  });

  it("en la copia conserva el precio cotizado y quita el de las piezas nuevas", () => {
    const quoted = { ...base, priceCents: 1000, quoteItemId: "i1" };
    const nueva = { ...base, priceCents: 500, quoteItemId: null };
    expect(withoutSalePrices([quoted, nueva], { keepQuoted: true })).toEqual([
      quoted,
      { ...nueva, priceCents: null },
    ]);
  });
});

describe("withoutWorkshops (D60)", () => {
  it("quita el taller de las piezas", () => {
    const base = {
      quantity: 1,
      description: "Fuente",
      measure: "",
      materials: [],
      services: ["1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d70"],
      weightGrams: null,
      priceCents: null,
      urgent: false,
      notes: "",
    };
    expect(withoutWorkshops([{ ...base, workshopId: "w1" }])).toEqual([
      { ...base, workshopId: null },
    ]);
  });
});
