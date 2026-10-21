import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  permission: "" as string,
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission = permission;
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "logistica" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: mocks.insert,
      update: (values: object) => ({
        eq: (_c: string, id: string) => mocks.update(values, id),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => ({
          select: async () => mocks.remove(table, id),
        }),
      }),
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createWorkshop, deleteWorkshop, setWorkshopActive, updateWorkshop } =
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
    mocks.remove
      .mockReset()
      .mockResolvedValue({ data: [{ id: "w1" }], error: null });
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

  it("borra un taller sin uso; solo el admin (talleres.eliminar)", async () => {
    expect(await deleteWorkshop("w1")).toEqual({ ok: true });
    expect(mocks.permission).toBe("talleres.eliminar");
    expect(mocks.remove).toHaveBeenCalledWith("workshops", "w1");
  });

  it("si está en uso muestra el aviso de la BD, que sugiere desactivarlo", async () => {
    const message =
      "“Taller Rímac” está en uso en 4 piezas. Desactívalo en su lugar.";
    mocks.remove.mockResolvedValue({
      data: null,
      error: { code: "23503", message },
    });
    expect(await deleteWorkshop("w1")).toEqual({ error: message });
  });

  it("al borrar no revela otros errores y avisa si no se borró nada", async () => {
    mocks.remove.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "detalle interno" },
    });
    const failed = { error: "No se pudo eliminar el taller." };
    expect(await deleteWorkshop("w1")).toEqual(failed);
    // Sin permiso (RLS) o ya borrado: el delete no falla pero no toca filas.
    mocks.remove.mockResolvedValue({ data: [], error: null });
    expect(await deleteWorkshop("w1")).toEqual(failed);
  });

  it("borrar exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(deleteWorkshop("w1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
