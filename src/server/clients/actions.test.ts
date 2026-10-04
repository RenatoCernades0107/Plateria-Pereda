import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  table: "",
  result: {
    data: { id: "c1", display_name: "Ana Pérez" },
    error: null as { code: string } | null,
  },
  updateResult: {
    data: [{ id: "c1", client_id: "c2" }] as object[] | null,
    error: null as { code: string } | null,
  },
  schedule: vi.fn(),
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
    from: (table: string) => {
      mocks.table = table;
      return {
        insert: (row: object) => {
          mocks.insert(row);
          return { select: () => ({ single: async () => mocks.result }) };
        },
        update: (row: object) => {
          mocks.update(row);
          const chain = {
            eq: (column: string, value: unknown) => {
              mocks.eq(column, value);
              return chain;
            },
            select: async () => mocks.updateResult,
          };
          return chain;
        },
      };
    },
  }),
}));
vi.mock("@/server/shopify-sync/run", () => ({
  scheduleShopifySync: mocks.schedule,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const {
  createClient,
  createContact,
  setClientActive,
  setContactActive,
  updateClient,
  updateContact,
} = await import("./actions");

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
      kind: "persona",
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

const contact = {
  firstName: "Luis",
  lastName: "Rojas",
  position: "Compras",
  document: { documentType: null, documentNumber: "" },
  phone: "988 777 666",
  email: "LUIS@andina.pe",
};

describe("edición de clientes y contactos", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [
      mocks.insert,
      mocks.update,
      mocks.eq,
      mocks.schedule,
      mocks.revalidate,
    ])
      fn.mockReset();
    mocks.result = {
      data: { id: "k1", display_name: "Luis Rojas" },
      error: null,
    };
    mocks.updateResult = { data: [{ id: "c1", client_id: "c2" }], error: null };
  });

  it("updateClient guarda los datos sin cambiar el tipo y programa la sincronización", async () => {
    expect(await updateClient("c1", person)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: "Ana", phone: "+51999888777" }),
    );
    expect(mocks.eq).toHaveBeenCalledWith("id", "c1");
    expect(mocks.eq).toHaveBeenCalledWith("kind", "persona");
    expect(mocks.schedule).toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/clientes/c1");
  });

  it("updateClient informa si no existe, si el documento se repite o si falla", async () => {
    mocks.updateResult = { data: [], error: null };
    expect(await updateClient("c1", person)).toEqual({
      error: "El cliente no existe.",
    });
    mocks.updateResult = { data: null, error: { code: "23505" } };
    expect(await updateClient("c1", person)).toEqual({
      error: "Ya existe un cliente con ese documento.",
    });
    mocks.updateResult = { data: null, error: { code: "42501" } };
    expect(await updateClient("c1", person)).toEqual({
      error: "No se pudo guardar el cliente.",
    });
    expect(await updateClient("c1", { ...person, firstName: "" })).toEqual({
      error: "Revisa los datos ingresados.",
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("setClientActive cambia el estado", async () => {
    expect(await setClientActive("c1", false)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ active: false });
    mocks.updateResult = { data: [], error: null };
    expect(await setClientActive("c1", true)).toEqual({
      error: "No se pudo cambiar el estado del cliente.",
    });
  });

  it("createContact registra el contacto normalizado en la empresa", async () => {
    expect(await createContact("c2", contact)).toEqual({
      ok: true,
      id: "k1",
      displayName: "Luis Rojas",
    });
    expect(mocks.table).toBe("contacts");
    expect(mocks.insert).toHaveBeenCalledWith({
      client_id: "c2",
      first_name: "Luis",
      last_name: "Rojas",
      position: "Compras",
      document_type: null,
      document_number: null,
      phone: "+51988777666",
      email: "luis@andina.pe",
    });
    expect(mocks.schedule).toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/clientes/c2");
  });

  it("createContact traduce errores", async () => {
    mocks.result = { data: null as never, error: { code: "23505" } };
    expect(await createContact("c2", contact)).toEqual({
      error: "Ya existe un registro con ese documento.",
    });
    mocks.result = { data: null as never, error: { code: "23514" } };
    expect(await createContact("c2", contact)).toEqual({
      error: "No se pudo registrar el contacto.",
    });
    expect(await createContact("c2", { ...contact, phone: "" })).toEqual({
      error: "Revisa los datos ingresados.",
    });
  });

  it("updateContact y setContactActive revalidan la empresa del contacto", async () => {
    expect(await updateContact("k1", contact)).toEqual({ ok: true });
    expect(mocks.revalidate).toHaveBeenCalledWith("/clientes/c2");
    expect(await setContactActive("k1", false)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenLastCalledWith({ active: false });

    mocks.updateResult = { data: [], error: null };
    expect(await updateContact("k1", contact)).toEqual({
      error: "El contacto no existe.",
    });
    expect(await setContactActive("k1", true)).toEqual({
      error: "No se pudo cambiar el estado del contacto.",
    });
    mocks.updateResult = { data: null, error: { code: "23505" } };
    expect(await updateContact("k1", contact)).toEqual({
      error: "Ya existe un registro con ese documento.",
    });
    expect(await updateContact("k1", { ...contact, firstName: " " })).toEqual({
      error: "Revisa los datos ingresados.",
    });
  });

  it("exige permiso de edición", async () => {
    mocks.forbidden = true;
    await expect(updateClient("c1", person)).rejects.toThrow("FORBIDDEN");
    await expect(createContact("c2", contact)).rejects.toThrow("FORBIDDEN");
    await expect(setContactActive("k1", false)).rejects.toThrow("FORBIDDEN");
  });
});
