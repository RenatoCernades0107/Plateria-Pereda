import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../../tests/msw/server";
import { ShopifyAuthError, ShopifyUnavailableError } from "./errors";
import {
  createTokenProvider,
  type StoredToken,
  type TokenStore,
} from "./token";

const SHOP = "pereda-test.myshopify.com";
const URL = `https://${SHOP}/admin/oauth/access_token`;
const NOW = new Date("2026-10-03T12:00:00Z");

function memoryStore(
  initial?: StoredToken,
): TokenStore & { value?: StoredToken } {
  const store: TokenStore & { value?: StoredToken } = {
    value: initial,
    async read() {
      return store.value ?? null;
    },
    async write(_shop, token) {
      store.value = token;
    },
    async clear() {
      store.value = undefined;
    },
  };
  return store;
}

describe("token de Shopify (client credentials)", () => {
  let requests: unknown[];

  beforeEach(() => {
    requests = [];
    server.use(
      http.post(URL, async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({
          access_token: `shpat_${requests.length}`,
          scope: "read_customers",
          expires_in: 86399,
        });
      }),
    );
  });

  const provider = (store: TokenStore) =>
    createTokenProvider({
      shop: SHOP,
      clientId: "id",
      clientSecret: "secreto",
      store,
      now: () => NOW,
    });

  it("pide un token nuevo con client credentials y lo guarda con su vencimiento", async () => {
    const store = memoryStore();
    expect(await provider(store).getToken()).toBe("shpat_1");
    expect(requests).toEqual([
      {
        grant_type: "client_credentials",
        client_id: "id",
        client_secret: "secreto",
      },
    ]);
    expect(store.value?.expiresAt.toISOString()).toBe(
      "2026-10-04T11:59:59.000Z",
    );
  });

  it("reutiliza el token guardado mientras sigue vigente", async () => {
    const store = memoryStore({
      accessToken: "shpat_guardado",
      expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    });
    expect(await provider(store).getToken()).toBe("shpat_guardado");
    expect(requests).toHaveLength(0);
  });

  it("lo renueva cuando está por vencer", async () => {
    const store = memoryStore({
      accessToken: "shpat_viejo",
      expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    });
    expect(await provider(store).getToken()).toBe("shpat_1");
  });

  it("varias peticiones a la vez comparten una sola renovación", async () => {
    const tokens = provider(memoryStore());
    const results = await Promise.all([tokens.getToken(), tokens.getToken()]);
    expect(results).toEqual(["shpat_1", "shpat_1"]);
    expect(requests).toHaveLength(1);
  });

  it("invalidate obliga a pedir otro token", async () => {
    const store = memoryStore();
    const tokens = provider(store);
    await tokens.getToken();
    await tokens.invalidate();
    expect(await tokens.getToken()).toBe("shpat_2");
  });

  it.each([
    [401, ShopifyAuthError],
    [400, ShopifyAuthError],
    [503, ShopifyUnavailableError],
  ])("una respuesta %i se convierte en %o", async (status, ErrorType) => {
    server.use(http.post(URL, () => new HttpResponse(null, { status })));
    await expect(provider(memoryStore()).getToken()).rejects.toBeInstanceOf(
      ErrorType,
    );
  });

  it("sin token en la respuesta o sin red da error", async () => {
    server.use(http.post(URL, () => HttpResponse.json({})));
    await expect(provider(memoryStore()).getToken()).rejects.toThrow(
      "no devolvió un token",
    );
    server.use(http.post(URL, () => HttpResponse.error()));
    await expect(provider(memoryStore()).getToken()).rejects.toBeInstanceOf(
      ShopifyUnavailableError,
    );
  });
});
