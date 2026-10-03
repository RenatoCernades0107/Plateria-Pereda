import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

const env = vi.hoisted(() => ({ mode: "fake" }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({ SHOPIFY_MODE: env.mode }),
}));

const { GET, POST } = await import("./route");

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/test/shopify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("/api/test/shopify", () => {
  beforeEach(() => {
    env.mode = "fake";
    fakeShopify.reset();
  });

  it("muestra el estado del Shopify falso", async () => {
    await new FakeShopifyGateway().createCustomer({
      firstName: "Ana",
      lastName: "",
    });
    const body = await (await GET()).json();
    expect(body.customers).toHaveLength(1);
  });

  it("reinicia la tienda y fuerza errores", async () => {
    await new FakeShopifyGateway().createCustomer({
      firstName: "Ana",
      lastName: "",
    });
    expect((await post({ action: "reset" })).status).toBe(200);
    expect(fakeShopify.snapshot().customers).toHaveLength(0);

    expect(
      (
        await post({
          action: "fail",
          method: "createCustomer",
          kind: "unavailable",
        })
      ).status,
    ).toBe(200);
    await expect(
      new FakeShopifyGateway().createCustomer({
        firstName: "Ana",
        lastName: "",
      }),
    ).rejects.toThrow("Shopify no responde");
  });

  it("rechaza acciones inválidas", async () => {
    expect((await post({ action: "borrar" })).status).toBe(400);
    expect((await post("no-json")).status).toBe(400);
  });

  it("no existe fuera del modo fake", async () => {
    env.mode = "live";
    expect((await GET()).status).toBe(404);
    expect((await post({ action: "reset" })).status).toBe(404);
  });
});
