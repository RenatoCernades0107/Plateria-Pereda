import { describe, expect, it, vi } from "vitest";

import {
  expectedShopDomain,
  FAKE_SHOP_DOMAIN,
  FAKE_WEBHOOK_SECRET,
  webhookSecret,
} from "./config";
import { signWebhook, verifyWebhookHmac } from "./hmac";
import { memoryWebhookStore } from "../../../tests/support/memory-webhook-store";
import { receiveWebhook } from "./receive";
import { processWebhookEvent } from "./router";

const SECRET = "secreto-de-la-app";
const SHOP = "pereda.myshopify.com";
const BODY = JSON.stringify({ id: 1, email: "ana@correo.pe" });

function shopifyHeaders(overrides: Record<string, string | null> = {}) {
  const values: Record<string, string | null> = {
    "x-shopify-hmac-sha256": signWebhook(BODY, SECRET),
    "x-shopify-shop-domain": SHOP,
    "x-shopify-webhook-id": "wh-1",
    "x-shopify-topic": "customers/update",
    "x-shopify-api-version": "2026-10",
    ...overrides,
  };
  const headers = new Headers();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) headers.set(key, value);
  }
  return headers;
}

describe("firma HMAC de Shopify", () => {
  it("acepta la firma correcta", () => {
    expect(verifyWebhookHmac(BODY, signWebhook(BODY, SECRET), SECRET)).toBe(
      true,
    );
  });

  it("rechaza una firma de otro secreto, un body alterado o sin firma", () => {
    expect(verifyWebhookHmac(BODY, signWebhook(BODY, "otro"), SECRET)).toBe(
      false,
    );
    expect(
      verifyWebhookHmac(`${BODY} `, signWebhook(BODY, SECRET), SECRET),
    ).toBe(false);
    expect(verifyWebhookHmac(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(BODY, "corta", SECRET)).toBe(false);
  });
});

describe("configuración de webhooks", () => {
  it("en modo live exige el secreto y la tienda configurados", () => {
    expect(webhookSecret({ SHOPIFY_MODE: "live" })).toBeNull();
    expect(expectedShopDomain({ SHOPIFY_MODE: "live" })).toBeNull();
    expect(
      webhookSecret({ SHOPIFY_MODE: "live", SHOPIFY_CLIENT_SECRET: "s" }),
    ).toBe("s");
  });

  it("en modo fake usa valores de desarrollo si no hay otros", () => {
    expect(webhookSecret({ SHOPIFY_MODE: "fake" })).toBe(FAKE_WEBHOOK_SECRET);
    expect(expectedShopDomain({ SHOPIFY_MODE: "fake" })).toBe(FAKE_SHOP_DOMAIN);
    expect(
      expectedShopDomain({ SHOPIFY_MODE: "fake", SHOPIFY_STORE_DOMAIN: SHOP }),
    ).toBe(SHOP);
  });
});

describe("recepción de webhooks", () => {
  const receive = (
    headers: Headers,
    rawBody = BODY,
    secret: string | null = SECRET,
  ) => {
    const { store, rows } = memoryWebhookStore();
    return {
      rows,
      result: receiveWebhook({
        headers,
        rawBody,
        secret,
        shopDomain: SHOP,
        store,
      }),
    };
  };

  it("guarda un webhook válido", async () => {
    const { result, rows } = receive(shopifyHeaders());
    expect(await result).toEqual({ status: 200, eventId: 1, duplicate: false });
    expect(rows[0]).toMatchObject({
      webhookId: "wh-1",
      topic: "customers/update",
      shopDomain: SHOP,
      apiVersion: "2026-10",
      payload: { id: 1, email: "ana@correo.pe" },
    });
  });

  it("rechaza firmas inválidas o sin secreto configurado", async () => {
    expect(
      (await receive(shopifyHeaders({ "x-shopify-hmac-sha256": "x" })).result)
        .status,
    ).toBe(401);
    expect((await receive(shopifyHeaders(), BODY, null).result).status).toBe(
      401,
    );
    expect((await receive(shopifyHeaders(), `${BODY}x`).result).status).toBe(
      401,
    );
  });

  it("rechaza webhooks de otra tienda", async () => {
    const { result } = receive(
      shopifyHeaders({ "x-shopify-shop-domain": "otra.myshopify.com" }),
    );
    expect(await result).toEqual({
      status: 401,
      error: "Tienda no reconocida",
    });
  });

  it("exige las cabeceras de Shopify y un objeto JSON", async () => {
    expect(
      (await receive(shopifyHeaders({ "x-shopify-topic": null })).result)
        .status,
    ).toBe(400);
    for (const body of ["no-json", "null", "3"]) {
      const headers = shopifyHeaders({
        "x-shopify-hmac-sha256": signWebhook(body, SECRET),
      });
      expect((await receive(headers, body).result).status).toBe(400);
    }
  });

  it("un reenvío del mismo webhook se marca como duplicado", async () => {
    const { store } = memoryWebhookStore();
    const args = {
      headers: shopifyHeaders(),
      rawBody: BODY,
      secret: SECRET,
      shopDomain: SHOP,
      store,
    };
    await receiveWebhook(args);
    expect(await receiveWebhook(args)).toEqual({
      status: 200,
      eventId: null,
      duplicate: true,
    });
  });
});

describe("router de webhooks", () => {
  async function stored(topic: string) {
    const { store, rows } = memoryWebhookStore();
    const id = (await store.insert({
      webhookId: "wh",
      topic,
      shopDomain: SHOP,
      apiVersion: null,
      payload: { id: 1 },
    }))!;
    return { store, rows, id };
  }

  it("llama al handler del topic una sola vez", async () => {
    const { store, rows, id } = await stored("orders/updated");
    const handler = vi.fn(async () => {});
    const handlers = { "orders/updated": handler };
    expect(await processWebhookEvent(store, id, handlers)).toBe("processed");
    expect(await processWebhookEvent(store, id, handlers)).toBe("skipped");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(rows[0]?.status).toBe("processed");
  });

  it("un topic desconocido se registra y se ignora", async () => {
    const { store, rows, id } = await stored("shop/update");
    expect(await processWebhookEvent(store, id, {})).toBe("ignored");
    expect(rows[0]?.status).toBe("ignored");
  });

  it("si el handler falla queda en error con el mensaje", async () => {
    const { store, rows, id } = await stored("orders/updated");
    const outcome = await processWebhookEvent(store, id, {
      "orders/updated": async () => {
        throw new Error("orden desconocida");
      },
    });
    expect(outcome).toBe("error");
    expect(rows[0]).toMatchObject({
      status: "error",
      error: "orden desconocida",
    });
  });
});
