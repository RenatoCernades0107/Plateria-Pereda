import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_WHATSAPP_TEMPLATE } from "@/domain/whatsapp-template";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  update: vi.fn(),
  single: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "admin-1", role: "admin" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (values: object) => ({ eq: () => mocks.update(values) }),
      select: () => ({ single: mocks.single }),
    }),
    storage: { from: () => ({ remove: mocks.remove }) },
  }),
}));
vi.mock("@/server/settings", () => ({ BRANDING_BUCKET: "branding" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { setLogo, updateSettings } = await import("./settings-actions");

const input = {
  legalName: "Platería Pereda",
  ruc: "",
  address: "Lima",
  phones: "",
  email: "",
  quoteValidityDays: "20",
  depositPercent: "40",
  whatsappTemplate: "Hola {cliente}",
  terms: "",
};

describe("updateSettings", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.update.mockReset().mockResolvedValue({ error: null });
  });

  it("guarda los datos convertidos; RUC vacío como null", async () => {
    expect(await updateSettings(input)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ruc: null,
        quote_validity_days: 20,
        deposit_percent: 40,
        whatsapp_template: "Hola {cliente}",
      }),
    );
  });

  it.each([
    ["", "vacía"],
    [DEFAULT_WHATSAPP_TEMPLATE, "igual a la original"],
  ])("una plantilla %#(%s) se guarda como null", async (whatsappTemplate) => {
    await updateSettings({ ...input, whatsappTemplate });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_template: null }),
    );
  });

  it("rechaza datos inválidos sin guardar", async () => {
    expect(await updateSettings({ ...input, depositPercent: "0" })).toEqual({
      error: "Revisa los datos ingresados.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("informa el error de la base de datos", async () => {
    mocks.update.mockResolvedValue({ error: { message: "x" } });
    expect(await updateSettings(input)).toEqual({
      error: "No se pudo guardar la configuración.",
    });
  });

  it("exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(updateSettings(input)).rejects.toThrow("FORBIDDEN");
  });
});

describe("setLogo", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.update.mockReset().mockResolvedValue({ error: null });
    mocks.single.mockReset().mockResolvedValue({
      data: { logo_path: "logo/viejo.png" },
      error: null,
    });
    mocks.remove.mockReset().mockResolvedValue({ error: null });
  });

  it("guarda la ruta nueva y borra el logo anterior", async () => {
    expect(await setLogo("logo/nuevo-1.webp")).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({
      logo_path: "logo/nuevo-1.webp",
    });
    expect(mocks.remove).toHaveBeenCalledWith(["logo/viejo.png"]);
  });

  it("null quita el logo", async () => {
    expect(await setLogo(null)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ logo_path: null });
    expect(mocks.remove).toHaveBeenCalledWith(["logo/viejo.png"]);
  });

  it("sin logo anterior no borra nada", async () => {
    mocks.single.mockResolvedValue({ data: { logo_path: null }, error: null });
    await setLogo("logo/a.png");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(["../settings.png", "logo/a.svg", "otro/a.png", "logo/a b.png"])(
    "rechaza la ruta %s",
    async (path) => {
      expect(await setLogo(path)).toEqual({
        error: "Archivo de logo inválido.",
      });
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("informa si no puede leer o guardar", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await setLogo("logo/a.png")).toEqual({
      error: "No se pudo actualizar el logo.",
    });
    mocks.single.mockResolvedValue({ data: { logo_path: null }, error: null });
    mocks.update.mockResolvedValue({ error: { message: "x" } });
    expect(await setLogo("logo/a.png")).toEqual({
      error: "No se pudo actualizar el logo.",
    });
  });
});
