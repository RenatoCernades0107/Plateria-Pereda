import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  role: "admin" as "admin" | "ventas",
  create: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const { createRestoration } = await import("./actions");
const { pieceToRpc, withoutSalePrices } =
  await vi.importActual<typeof import("./create")>("./create");

const piece = {
  workshopId: null,
  description: "Fuente ovalada",
  measure: "40 cm",
  material: { id: null, name: "Plata 950" },
  service: { id: null, name: "" },
  weight: "820,5",
  price: "1,200.50",
  notes: "",
};

const input = {
  clientId: "00000000-0000-0000-0000-000000000001",
  contactId: null,
  paymentType: "a_cuenta" as const,
  depositPercent: "50",
  pricesIncludeIgv: "no" as const,
  notes: "",
  pieces: [piece],
};

describe("createRestoration", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.role = "admin";
    mocks.create.mockReset().mockResolvedValue({ id: "r1", code: "RES-00001" });
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
        depositPercent: 50,
        pricesIncludeIgv: false,
        pieces: [
          expect.objectContaining({ priceCents: 120050, weightGrams: 820.5 }),
        ],
      }),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/restauraciones");
  });

  it("ventas registra las piezas sin precio de venta: lo asigna el admin (D58)", async () => {
    mocks.role = "ventas";
    expect(await createRestoration(input)).toMatchObject({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        pieces: [expect.objectContaining({ priceCents: null })],
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
  });

  it("exige permiso", async () => {
    mocks.forbidden = true;
    await expect(createRestoration(input)).rejects.toThrow("FORBIDDEN");
  });
});

describe("pieceToRpc", () => {
  it("convierte céntimos a soles y los catálogos a id + nombre", () => {
    expect(
      pieceToRpc({
        workshopId: null,
        description: "Fuente",
        measure: "",
        material: { id: "m1", name: "Plata" },
        service: null,
        weightGrams: 12.5,
        priceCents: 120050,
        urgent: true,
        notes: "",
      }),
    ).toEqual({
      workshop_id: null,
      description: "Fuente",
      measure: "",
      material_id: "m1",
      material_name: "Plata",
      service_id: null,
      service_name: "",
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
        description: "Fuente",
        measure: "",
        material: null,
        service: null,
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
        description: "Fuente",
        measure: "",
        material: null,
        service: null,
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
    description: "Fuente",
    measure: "",
    material: null,
    service: null,
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
