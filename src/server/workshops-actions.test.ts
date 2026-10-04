import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "logistica" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: mocks.insert,
      update: (values: object) => ({
        eq: (_c: string, id: string) => mocks.update(values, id),
      }),
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createWorkshop, setWorkshopActive, updateWorkshop } =
  await import("./workshops-actions");

const input = {
  name: " Taller Rímac ",
  contactName: "José",
  phone: "999",
  address: "",
  notes: "",
};
const row = {
  name: "Taller Rímac",
  contact_name: "José",
  phone: "999",
  address: "",
  notes: "",
};

describe("acciones de talleres", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.update.mockReset().mockResolvedValue({ error: null });
  });

  it("crea y edita con los datos normalizados", async () => {
    expect(await createWorkshop(input)).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith(row);
    expect(await updateWorkshop("w1", input)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(row, "w1");
  });

  it("traduce el nombre duplicado", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    mocks.update.mockResolvedValue({ error: { code: "23505" } });
    const duplicate = { error: "Ya existe un taller con ese nombre." };
    expect(await createWorkshop(input)).toEqual(duplicate);
    expect(await updateWorkshop("w1", input)).toEqual(duplicate);
  });

  it("informa otros errores", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "42501" } });
    mocks.update.mockResolvedValue({ error: { code: "42501" } });
    expect(await createWorkshop(input)).toEqual({
      error: "No se pudo crear el taller.",
    });
    expect(await updateWorkshop("w1", input)).toEqual({
      error: "No se pudo guardar el taller.",
    });
    expect(await setWorkshopActive("w1", false)).toEqual({
      error: "No se pudo actualizar el taller.",
    });
  });

  it("rechaza datos inválidos sin tocar la base de datos", async () => {
    const invalid = { ...input, name: "" };
    expect(await createWorkshop(invalid)).toEqual({
      error: "Revisa los datos ingresados.",
    });
    expect(await updateWorkshop("w1", invalid)).toEqual({
      error: "Revisa los datos ingresados.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("desactiva un taller", async () => {
    expect(await setWorkshopActive("w1", false)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ active: false }, "w1");
  });

  it("exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(createWorkshop(input)).rejects.toThrow("FORBIDDEN");
    await expect(updateWorkshop("w1", input)).rejects.toThrow("FORBIDDEN");
    await expect(setWorkshopActive("w1", true)).rejects.toThrow("FORBIDDEN");
  });
});
