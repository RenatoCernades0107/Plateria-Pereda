import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "admin" as "admin" | "ventas",
  rpc: vi.fn(),
  deposit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => ({ id: "u1", role: mocks.role }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (...a: unknown[]) => ({ single: async () => mocks.rpc(...a) }),
  }),
}));
vi.mock("@/server/payments/initial-deposit", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/payments/initial-deposit")
  >()),
  recordInitialDeposit: mocks.deposit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const { createRestorationFromQuote } = await import("./actions");

const QUOTE_ID = "00000000-0000-0000-0000-0000000000c1";
const ITEM_ID = "00000000-0000-0000-0000-0000000000d1";

const piece = {
  workshopId: null,
  description: "Bandeja",
  measure: "",
  materials: [],
  service: { id: null, name: "Limpieza" },
  weight: "",
  price: "",
  notes: "",
  quoteItemId: ITEM_ID,
  initialStatus: "en_consulta" as const,
  statusNote: "",
};

const input = {
  clientId: "00000000-0000-0000-0000-000000000001",
  contactId: null,
  paymentType: "contado" as const,
  depositAmount: "",
  depositMethodId: "",
  notes: "",
  pieces: [piece],
};

describe("createRestorationFromQuote · piezas sin precio", () => {
  beforeEach(() => {
    mocks.role = "admin";
    mocks.rpc
      .mockReset()
      .mockResolvedValue({ data: { id: "r1", code: "RES-00010" } });
    mocks.deposit.mockReset().mockResolvedValue(true);
    mocks.revalidate.mockReset();
  });

  it.each(["admin", "ventas"] as const)(
    "crea la restauración sin precio ni nota (%s): la BD la pasa a Consulta",
    async (role) => {
      mocks.role = role;
      expect(await createRestorationFromQuote(QUOTE_ID, input)).toEqual({
        ok: true,
        id: "r1",
        code: "RES-00010",
      });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "create_restoration_from_whatsapp_quote",
        expect.objectContaining({
          p_quote_id: QUOTE_ID,
          p_pieces: [
            expect.objectContaining({
              description: "Bandeja",
              quantity: 1,
              price: null,
              quote_item_id: ITEM_ID,
              status: "en_consulta",
              status_note: "",
            }),
          ],
        }),
      );
      expect(mocks.deposit).not.toHaveBeenCalled();
    },
  );

  it("sin precio tampoco exige el estado inicial", async () => {
    await createRestorationFromQuote(QUOTE_ID, {
      ...input,
      pieces: [{ ...piece, initialStatus: undefined }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_restoration_from_whatsapp_quote",
      expect.objectContaining({
        p_pieces: [expect.objectContaining({ price: null, status: null })],
      }),
    );
  });

  it("con precio sigue exigiendo el estado y la nota de Consulta", async () => {
    expect(
      await createRestorationFromQuote(QUOTE_ID, {
        ...input,
        pieces: [{ ...piece, price: "80" }],
      }),
    ).toEqual({ error: "Revisa los datos ingresados." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
