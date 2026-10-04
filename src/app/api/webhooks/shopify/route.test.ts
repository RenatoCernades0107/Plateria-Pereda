import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signWebhook } from "@/server/shopify-webhooks/hmac";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  process: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => mocks.after(fn),
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({
    SHOPIFY_MODE: "live",
    SHOPIFY_CLIENT_SECRET: "secreto",
    SHOPIFY_STORE_DOMAIN: "pereda.myshopify.com",
  }),
}));
vi.mock("@/server/shopify-webhooks/store", () => ({
  supabaseWebhookStore: { insert: mocks.insert },
}));
vi.mock("@/server/shopify-webhooks/router", () => ({
  processWebhookEvent: mocks.process,
}));
vi.mock("@/server/shopify-webhooks/registry", () => ({
  shopifyWebhookHandlers: { "customers/update": vi.fn() },
}));

const { POST } = await import("./route");

const BODY = JSON.stringify({ id: 1 });
const request = (hmac = signWebhook(BODY, "secreto")) =>
  new NextRequest("http://localhost/api/webhooks/shopify", {
    method: "POST",
    body: BODY,
    headers: {
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": "pereda.myshopify.com",
      "x-shopify-webhook-id": "wh-1",
      "x-shopify-topic": "orders/updated",
    },
  });

describe("/api/webhooks/shopify", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.insert.mockResolvedValue(42);
  });

  it("responde 200 y procesa el evento después de responder", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: false });
    expect(mocks.process).not.toHaveBeenCalled();

    await mocks.after.mock.calls[0]![0]();
    expect(mocks.process).toHaveBeenCalledWith(
      expect.anything(),
      42,
      expect.objectContaining({ "customers/update": expect.any(Function) }),
    );
  });

  it("un error al procesar no rompe la respuesta", async () => {
    mocks.process.mockRejectedValue(new Error("x"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await POST(request());
    await mocks.after.mock.calls[0]![0]();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("un duplicado no se vuelve a procesar", async () => {
    mocks.insert.mockResolvedValue(null);
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("una firma inválida responde 401 sin guardar nada", async () => {
    const response = await POST(request("firma-falsa"));
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
