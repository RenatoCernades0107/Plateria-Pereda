import { describe, expect, it, vi } from "vitest";

import type { Json } from "@/lib/supabase/database.types";

import { clientWebhookHandlers, parseCustomerWebhook } from "./webhooks";

const event = (payload: { [key: string]: Json }) => ({
  id: 1,
  webhookId: "wh-1",
  topic: "customers/update",
  shopDomain: "pereda.myshopify.com",
  payload,
});

describe("parseCustomerWebhook", () => {
  it("lee el id GraphQL, nombres, email y teléfono", () => {
    expect(
      parseCustomerWebhook({
        id: 71,
        admin_graphql_api_id: "gid://shopify/Customer/71",
        first_name: "Ana",
        last_name: "Pérez",
        email: "ana@correo.pe",
        phone: null,
      }),
    ).toEqual({
      customerId: "gid://shopify/Customer/71",
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@correo.pe",
      phone: null,
    });
  });

  it("arma el id desde el numérico y rechaza payloads sin id", () => {
    expect(parseCustomerWebhook({ id: 72 })?.customerId).toBe(
      "gid://shopify/Customer/72",
    );
    expect(parseCustomerWebhook({ first_name: "X" })).toBeNull();
    expect(parseCustomerWebhook(null)).toBeNull();
  });
});

describe("clientWebhookHandlers", () => {
  it("aplica el cambio de customers/update", async () => {
    const apply = vi.fn().mockResolvedValue(1);
    await clientWebhookHandlers(apply)["customers/update"]!(
      event({
        admin_graphql_api_id: "gid://shopify/Customer/71",
        phone: "+51999",
      }),
    );
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "gid://shopify/Customer/71",
        phone: "+51999",
      }),
    );
  });

  it("falla si el payload no identifica al cliente", async () => {
    await expect(
      clientWebhookHandlers(vi.fn())["customers/update"]!(event({})),
    ).rejects.toThrow("id del cliente");
  });
});
