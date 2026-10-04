import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  insert: vi.fn(),
  result: {
    data: { id: "c1", display_name: "Ana Pérez" },
    error: null as { code: string } | null,
  },
  schedule: vi.fn(),
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
      insert: (row: object) => {
        mocks.insert(row);
        return { select: () => ({ single: async () => mocks.result }) };
      },
    }),
  }),
}));
vi.mock("@/server/shopify-sync/run", () => ({
  scheduleShopifySync: mocks.schedule,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createClient } = await import("./actions");

const person = {
  kind: "persona" as const,
  firstName: "Ana",
  lastName: "Pérez",
  document: { documentType: "dni" as const, documentNumber: "45678912" },
  phone: "999888777",
  email: "",
  address: "",
  notes: "",
};

describe("createClient", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.insert.mockReset();
    mocks.schedule.mockReset();
    mocks.result = {
      data: { id: "c1", display_name: "Ana Pérez" },
      error: null,
    };
  });

  it("registra la persona normalizada y programa la sincronización", async () => {
    expect(await createClient(person)).toEqual({
      ok: true,
      id: "c1",
      displayName: "Ana Pérez",
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      kind: "persona",
      first_name: "Ana",
      last_name: "Pérez",
      document_type: "dni",
      document_number: "45678912",
      phone: "+51999888777",
      email: null,
      address: "",
      notes: "",
    });
    expect(mocks.schedule).toHaveBeenCalled();
  });

  it("registra una empresa con RUC, ciudad y región", async () => {
    await createClient({
      kind: "empresa",
      legalName: "Andina S.A.C.",
      ruc: "20100047218",
      city: "Lima",
      region: "LIM",
      phone: "012345678",
      email: "",
      address: "",
      notes: "",
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "empresa",
        legal_name: "Andina S.A.C.",
        document_type: "ruc",
        document_number: "20100047218",
        city: "Lima",
        region: "LIM",
        phone: "+5112345678",
      }),
    );
  });

  it("traduce el documento repetido y otros errores", async () => {
    mocks.result = { data: null as never, error: { code: "23505" } };
    expect(await createClient(person)).toEqual({
      error: "Ya existe un cliente con ese documento.",
    });
    mocks.result = { data: null as never, error: { code: "42501" } };
    expect(await createClient(person)).toEqual({
      error: "No se pudo registrar el cliente.",
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("rechaza datos inválidos y exige permiso", async () => {
    expect(await createClient({ ...person, phone: "" })).toEqual({
      error: "Revisa los datos ingresados.",
    });
    mocks.forbidden = true;
    await expect(createClient(person)).rejects.toThrow("FORBIDDEN");
  });
});
