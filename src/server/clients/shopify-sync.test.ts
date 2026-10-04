import { beforeEach, describe, expect, it } from "vitest";

import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import type { SyncJob } from "@/server/shopify-sync/jobs";

import {
  clientJobHandlers,
  takenField,
  type ClientRecord,
  type ClientSyncRepository,
  type ContactRecord,
} from "./shopify-sync";

const person: ClientRecord = {
  id: "c1",
  kind: "persona",
  firstName: "Ana",
  lastName: "Pérez",
  legalName: "",
  documentNumber: "45678912",
  phone: "+51999888777",
  email: "ana@correo.pe",
  address: "",
  city: "",
  region: null,
  shopifyCustomerId: null,
  shopifyCompanyId: null,
  shopifyCompanyLocationId: null,
};

const company: ClientRecord = {
  ...person,
  id: "c2",
  kind: "empresa",
  firstName: "",
  lastName: "",
  legalName: "Joyería Andina S.A.C.",
  documentNumber: "20100047218",
  phone: "+5112345678",
  email: null,
  city: "Arequipa",
  region: "ARE",
};

const contact: ContactRecord = {
  id: "k1",
  clientId: "c2",
  firstName: "Luis",
  lastName: "Rojas",
  phone: "+51988777666",
  email: "luis@andina.pe",
  shopifyCustomerId: null,
  shopifyCompanyContactId: null,
};

function memoryRepo(clients: ClientRecord[], contacts: ContactRecord[] = []) {
  const db = {
    clients: new Map(clients.map((c) => [c.id, { ...c }])),
    contacts: new Map(contacts.map((c) => [c.id, { ...c }])),
  };
  const repo: ClientSyncRepository = {
    getClient: async (id) => db.clients.get(id) ?? null,
    setClientShopifyIds: async (id, ids) => {
      Object.assign(db.clients.get(id)!, ids);
    },
    getContact: async (id) => db.contacts.get(id) ?? null,
    setContactShopifyIds: async (id, ids) => {
      Object.assign(db.contacts.get(id)!, ids);
    },
  };
  return { repo, db };
}

const job = (kind: string, entityId: string): SyncJob => ({
  id: 1,
  kind,
  entityTable: kind.startsWith("contact.") ? "contacts" : "clients",
  entityId,
  payload: {},
  attempts: 1,
  maxAttempts: 8,
});

describe("handlers de clientes", () => {
  let gateway: FakeShopifyGateway;

  beforeEach(() => {
    fakeShopify.reset();
    gateway = new FakeShopifyGateway();
  });

  it("crea la persona en Shopify y guarda su id", async () => {
    const { repo, db } = memoryRepo([person]);
    const result = await clientJobHandlers(repo)["customer.create"]!(
      job("customer.create", "c1"),
      gateway,
    );
    const id = db.clients.get("c1")!.shopifyCustomerId;
    expect(id).toMatch(/gid:\/\/shopify\/Customer\//);
    expect(result).toEqual({ shopifyCustomerId: id, linked: false });
    expect(fakeShopify.snapshot().customers[0]).toMatchObject({
      firstName: "Ana",
      email: "ana@correo.pe",
      phone: "+51999888777",
    });
  });

  it("si el email ya existe en Shopify vincula ese cliente en vez de duplicarlo", async () => {
    const existing = await gateway.createCustomer({
      firstName: "Ana",
      lastName: "(tienda)",
      email: "ana@correo.pe",
    });
    const { repo, db } = memoryRepo([person]);
    const result = await clientJobHandlers(repo)["customer.create"]!(
      job("customer.create", "c1"),
      gateway,
    );
    expect(result).toEqual({ shopifyCustomerId: existing.id, linked: true });
    expect(db.clients.get("c1")!.shopifyCustomerId).toBe(existing.id);
    expect(fakeShopify.snapshot().customers).toHaveLength(1);
  });

  it("si el teléfono ya existe también vincula", async () => {
    const existing = await gateway.createCustomer({
      firstName: "Otra",
      lastName: "",
      phone: "+51999888777",
    });
    const { repo } = memoryRepo([{ ...person, email: null }]);
    expect(
      await clientJobHandlers(repo)["customer.create"]!(
        job("customer.create", "c1"),
        gateway,
      ),
    ).toEqual({ shopifyCustomerId: existing.id, linked: true });
  });

  it("es idempotente: si ya tiene id no lo vuelve a crear", async () => {
    const { repo } = memoryRepo([
      { ...person, shopifyCustomerId: "gid://shopify/Customer/7" },
    ]);
    expect(
      await clientJobHandlers(repo)["customer.create"]!(
        job("customer.create", "c1"),
        gateway,
      ),
    ).toEqual({ shopifyCustomerId: "gid://shopify/Customer/7" });
    expect(fakeShopify.snapshot().calls).toEqual([]);
  });

  it("otros rechazos de Shopify se propagan", async () => {
    const { repo } = memoryRepo([{ ...person, email: "ana@" }]);
    await expect(
      clientJobHandlers(repo)["customer.create"]!(
        job("customer.create", "c1"),
        gateway,
      ),
    ).rejects.toThrow("Email is invalid");
  });

  it("crea la empresa como Company con ciudad y región, y guarda sus ids", async () => {
    const { repo, db } = memoryRepo([company]);
    await clientJobHandlers(repo)["company.create"]!(
      job("company.create", "c2"),
      gateway,
    );
    const saved = db.clients.get("c2")!;
    expect(saved.shopifyCompanyId).toMatch(/Company\//);
    expect(saved.shopifyCompanyLocationId).toMatch(/CompanyLocation\//);
    expect(fakeShopify.snapshot().companies[0]).toMatchObject({
      name: "Joyería Andina S.A.C.",
      externalId: "20100047218",
      phone: "+5112345678",
      address: {
        address1: "Joyería Andina S.A.C.",
        city: "Arequipa",
        zoneCode: "ARE",
      },
    });
  });

  it("una empresa sin ciudad ni región usa Lima", async () => {
    const { repo } = memoryRepo([
      { ...company, city: "", region: null, address: "Av. 1" },
    ]);
    await clientJobHandlers(repo)["company.create"]!(
      job("company.create", "c2"),
      gateway,
    );
    expect(fakeShopify.snapshot().companies[0]?.address).toEqual({
      address1: "Av. 1",
      city: "Lima",
      zoneCode: "LIM",
    });
  });

  it("una empresa ya sincronizada no se vuelve a crear", async () => {
    const { repo } = memoryRepo([
      { ...company, shopifyCompanyId: "gid://shopify/Company/1" },
    ]);
    expect(
      await clientJobHandlers(repo)["company.create"]!(
        job("company.create", "c2"),
        gateway,
      ),
    ).toEqual({ shopifyCompanyId: "gid://shopify/Company/1" });
  });

  it("el contacto espera a que la empresa esté en Shopify", async () => {
    const { repo } = memoryRepo([company], [contact]);
    await expect(
      clientJobHandlers(repo)["contact.create"]!(
        job("contact.create", "k1"),
        gateway,
      ),
    ).rejects.toBeInstanceOf(ShopifyUnavailableError);
  });

  it("crea el contacto en la Company y guarda sus ids", async () => {
    const { repo, db } = memoryRepo([company], [contact]);
    const handlers = clientJobHandlers(repo);
    await handlers["company.create"]!(job("company.create", "c2"), gateway);
    await handlers["contact.create"]!(job("contact.create", "k1"), gateway);
    const saved = db.contacts.get("k1")!;
    expect(saved.shopifyCompanyContactId).toMatch(/CompanyContact\//);
    expect(fakeShopify.snapshot().companies[0]?.contacts).toEqual([
      {
        id: saved.shopifyCompanyContactId,
        customerId: saved.shopifyCustomerId,
      },
    ]);
    // Idempotente
    expect(
      await handlers["contact.create"]!(job("contact.create", "k1"), gateway),
    ).toEqual({
      shopifyCompanyContactId: saved.shopifyCompanyContactId,
    });
  });

  it("si el contacto ya es cliente de Shopify lo vincula a la Company", async () => {
    const existing = await gateway.createCustomer({
      firstName: "Luis",
      lastName: "",
      email: "luis@andina.pe",
    });
    const { repo, db } = memoryRepo([company], [contact]);
    const handlers = clientJobHandlers(repo);
    await handlers["company.create"]!(job("company.create", "c2"), gateway);
    const result = await handlers["contact.create"]!(
      job("contact.create", "k1"),
      gateway,
    );
    expect(result).toMatchObject({
      shopifyCustomerId: existing.id,
      linked: true,
    });
    expect(db.contacts.get("k1")!.shopifyCustomerId).toBe(existing.id);
  });

  it("si el registro ya no existe no se reintenta", async () => {
    const { repo } = memoryRepo([]);
    const handlers = clientJobHandlers(repo);
    for (const kind of [
      "customer.create",
      "company.create",
      "contact.create",
    ]) {
      await expect(
        handlers[kind]!(job(kind, "nada"), gateway),
      ).rejects.toBeInstanceOf(ShopifyUserError);
    }
  });
});

describe("handlers de actualización (P16)", () => {
  let gateway: FakeShopifyGateway;

  beforeEach(() => {
    fakeShopify.reset();
    gateway = new FakeShopifyGateway();
  });

  it("envía a Shopify los datos vigentes de la persona", async () => {
    const customer = await gateway.createCustomer({
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@correo.pe",
    });
    const { repo } = memoryRepo([
      {
        ...person,
        firstName: "Ana María",
        email: null,
        phone: "+51911222333",
        shopifyCustomerId: customer.id,
      },
    ]);
    await clientJobHandlers(repo)["customer.update"]!(
      job("customer.update", "c1"),
      gateway,
    );
    expect(await gateway.getCustomer(customer.id)).toMatchObject({
      firstName: "Ana María",
      phone: "+51911222333",
      // Un email quitado en el sistema no se borra en Shopify.
      email: "ana@correo.pe",
    });
  });

  it("actualiza la Company y la dirección de su ubicación", async () => {
    const created = await gateway.createCompany({
      name: "Joyería Andina S.A.C.",
      externalId: "20100047218",
      address: { address1: "Av. Larco 1", city: "Lima", zoneCode: "LIM" },
    });
    const { repo } = memoryRepo([
      {
        ...company,
        legalName: "Joyería Andina del Sur S.A.C.",
        address: "Calle Mercaderes 200",
        shopifyCompanyId: created.id,
        shopifyCompanyLocationId: created.locationId,
      },
    ]);
    await clientJobHandlers(repo)["company.update"]!(
      job("company.update", "c2"),
      gateway,
    );
    expect(fakeShopify.snapshot().companies[0]).toMatchObject({
      name: "Joyería Andina del Sur S.A.C.",
      phone: "+5112345678",
      address: {
        address1: "Calle Mercaderes 200",
        city: "Arequipa",
        zoneCode: "ARE",
      },
    });
  });

  it("actualiza el cliente de Shopify del contacto", async () => {
    const customer = await gateway.createCustomer({
      firstName: "Luis",
      lastName: "",
    });
    const { repo } = memoryRepo(
      [company],
      [{ ...contact, shopifyCustomerId: customer.id }],
    );
    await clientJobHandlers(repo)["contact.update"]!(
      job("contact.update", "k1"),
      gateway,
    );
    expect(await gateway.getCustomer(customer.id)).toMatchObject({
      lastName: "Rojas",
      email: "luis@andina.pe",
    });
  });

  it("espera al alta si aún no tiene id y no reintenta si ya no existe", async () => {
    const { repo } = memoryRepo([person, company], [contact]);
    const handlers = clientJobHandlers(repo);
    const cases = [
      ["customer.update", "c1"],
      ["company.update", "c2"],
      ["contact.update", "k1"],
    ] as const;
    for (const [kind, id] of cases) {
      await expect(
        handlers[kind]!(job(kind, id), gateway),
      ).rejects.toBeInstanceOf(ShopifyUnavailableError);
      await expect(
        handlers[kind]!(job(kind, "nada"), gateway),
      ).rejects.toBeInstanceOf(ShopifyUserError);
    }
  });
});

describe("takenField", () => {
  it("reconoce email o teléfono ya usados", () => {
    const taken = (field: string) =>
      new ShopifyUserError([
        { field: ["input", field], message: `${field} has already been taken` },
      ]);
    expect(takenField(taken("email"))).toBe("email");
    expect(takenField(taken("phone"))).toBe("phone");
    expect(takenField(taken("name"))).toBeNull();
    expect(
      takenField(
        new ShopifyUserError([
          { field: ["email"], message: "Email is invalid" },
        ]),
      ),
    ).toBeNull();
    expect(takenField(new Error("x"))).toBeNull();
  });
});
