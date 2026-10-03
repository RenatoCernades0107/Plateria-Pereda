import { describe, expect, it, vi } from "vitest";

import { DEFAULT_WHATSAPP_TEMPLATE } from "@/domain/whatsapp-template";

const mocks = vi.hoisted(() => ({ single: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ single: mocks.single }) }),
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
        }),
      }),
    },
  }),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const { getSettings } = await import("./settings");

const row = {
  legal_name: "Platería Pereda",
  ruc: "20100047218",
  address: "Lima",
  phones: "999",
  email: "a@b.pe",
  logo_path: "logo/a.png",
  quote_validity_days: 15,
  deposit_percent: "50.00",
  whatsapp_template: null,
  terms: "",
};

describe("getSettings", () => {
  it("convierte la fila y arma la URL pública del logo", async () => {
    mocks.single.mockResolvedValue({ data: row, error: null });
    expect(await getSettings()).toMatchObject({
      legalName: "Platería Pereda",
      logoUrl: "https://cdn.test/branding/logo/a.png",
      depositPercent: 50,
      customWhatsappTemplate: null,
      whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
    });
  });

  it("usa la plantilla guardada y no arma URL sin logo", async () => {
    mocks.single.mockResolvedValue({
      data: { ...row, logo_path: null, whatsapp_template: "Hola" },
      error: null,
    });
    expect(await getSettings()).toMatchObject({
      logoUrl: null,
      whatsappTemplate: "Hola",
    });
  });

  it("propaga el error de la base de datos", async () => {
    mocks.single.mockResolvedValue({ data: null, error: new Error("caída") });
    await expect(getSettings()).rejects.toThrow("caída");
  });
});
