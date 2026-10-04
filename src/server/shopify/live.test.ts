import { beforeEach, describe, expect, it } from "vitest";

import { shopifyGatewayContract } from "../../../tests/contract/shopify-gateway";
import { server } from "../../../tests/msw/server";
import {
  shopifyEmulator,
  TEST_API_VERSION,
  TEST_SHOP,
} from "../../../tests/msw/shopify-emulator";
import { FakeShopifyGateway, fakeShopify } from "./fake";
import { createGraphqlClient } from "./graphql-client";
import { LiveShopifyGateway } from "./live";

function makeLive() {
  return new LiveShopifyGateway(
    createGraphqlClient({
      shop: TEST_SHOP,
      apiVersion: TEST_API_VERSION,
      tokens: {
        getToken: async () => "shpat_test",
        invalidate: async () => {},
      },
      sleep: async () => {},
    }),
  );
}

beforeEach(() => {
  server.use(...shopifyEmulator);
});

shopifyGatewayContract("live con la API emulada", makeLive);

describe("adaptador live: órdenes", () => {
  beforeEach(() => fakeShopify.reset());

  it("lee una orden por etiqueta y su estado de pago", async () => {
    const tienda = new FakeShopifyGateway();
    const { id: customerId } = await tienda.createCustomer({
      firstName: "Ana",
      lastName: "",
    });
    const created = await tienda.createOrder({
      customerId,
      lines: [
        { title: "Restauración RES-00007-1", price: "400.00", quantity: 1 },
      ],
      tags: ["RES-00007"],
      payments: [{ amount: "200.00", gateway: "Yape" }],
    });
    await tienda.fulfillLines(created.id, [created.lines[0]!.id]);

    const live = makeLive();
    const order = await live.findOrderByTag("RES-00007");
    expect(order).toEqual({
      id: created.id,
      name: "#1001",
      tags: ["RES-00007"],
      lines: [
        {
          id: created.lines[0]!.id,
          title: "Restauración RES-00007-1",
          price: "400.00",
          quantity: 1,
          fulfilled: true,
        },
      ],
    });
    expect(await live.getOrderFinancials(created.id)).toEqual({
      id: created.id,
      name: "#1001",
      financialStatus: "PARTIALLY_PAID",
      total: "400.00",
      received: "200.00",
      outstanding: "200.00",
    });
    expect(await live.findOrderByTag("RES-00008")).toBeNull();
    await expect(live.getOrderFinancials("gid://nada")).rejects.toThrow(
      "No existe en Shopify",
    );
  });

  it("actualizar un cliente inexistente da error", async () => {
    await expect(
      makeLive().updateCustomer("gid://shopify/Customer/1", { firstName: "x" }),
    ).rejects.toThrow("Customer does not exist");
  });
});
