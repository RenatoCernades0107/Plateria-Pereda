import { describe, expect, it } from "vitest";

import {
  mergeClientOptions,
  optionKey,
  parseClientQuery,
  type ClientOption,
} from "./client-search";

const local: ClientOption = {
  source: "local",
  kind: "persona",
  clientId: "c1",
  name: "Ana Pérez",
  documentType: "dni",
  documentNumber: "45678912",
  phone: "+51999888777",
  email: "ana@correo.pe",
  shopifyCustomerId: "gid://shopify/Customer/1",
};

const contact: ClientOption = {
  source: "local",
  kind: "contacto",
  clientId: "c2",
  contactId: "k1",
  name: "Luis Rojas",
  companyName: "Andina S.A.C.",
  phone: "+51988777666",
  email: null,
  shopifyCustomerId: "gid://shopify/Customer/2",
};

const shopify = (
  id: number,
  overrides: Partial<ClientOption> = {},
): ClientOption =>
  ({
    source: "shopify",
    kind: "persona",
    shopifyCustomerId: `gid://shopify/Customer/${id}`,
    name: `Cliente ${id}`,
    phone: null,
    email: null,
    ...overrides,
  }) as ClientOption;

describe("mergeClientOptions", () => {
  it("no repite clientes de Shopify que ya están en el sistema", () => {
    const merged = mergeClientOptions(
      [local, contact],
      [
        shopify(1),
        shopify(2),
        shopify(3, { email: "ana@correo.pe" }),
        shopify(4, { phone: "+51988777666" }),
        shopify(5),
      ],
    );
    expect(merged.map(optionKey)).toEqual([
      "client:c1",
      "contact:k1",
      "shopify:gid://shopify/Customer/5",
    ]);
  });

  it("sin resultados locales muestra los de Shopify", () => {
    expect(mergeClientOptions([], [shopify(9)])).toHaveLength(1);
  });
});

describe("parseClientQuery", () => {
  it("limpia caracteres especiales y extrae dígitos", () => {
    expect(parseClientQuery("  Ana,(Pérez)*  999 888 ")).toEqual({
      text: "Ana Pérez 999 888",
      digits: "999888",
      searchable: true,
    });
  });

  it("necesita al menos 2 caracteres", () => {
    expect(parseClientQuery(" a ").searchable).toBe(false);
  });
});
