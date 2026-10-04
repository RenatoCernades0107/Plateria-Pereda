import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { server } from "../../../tests/msw/server";
import {
  ShopifyAuthError,
  ShopifyError,
  ShopifyUnavailableError,
  ShopifyUserError,
} from "./errors";
import {
  assertNoUserErrors,
  backoffDelay,
  createGraphqlClient,
} from "./graphql-client";

const SHOP = "pereda-test.myshopify.com";
const URL = `https://${SHOP}/admin/api/2026-10/graphql.json`;
const ok = () => HttpResponse.json({ data: { shop: { name: "Pereda" } } });

describe("cliente GraphQL de Shopify", () => {
  let delays: number[];
  let tokens: {
    getToken: Mock<() => Promise<string>>;
    invalidate: Mock<() => Promise<void>>;
  };
  let headers: (string | null)[];

  beforeEach(() => {
    delays = [];
    headers = [];
    let n = 0;
    tokens = {
      getToken: vi.fn<() => Promise<string>>(async () => `shpat_${n}`),
      invalidate: vi.fn<() => Promise<void>>(async () => {
        n += 1;
      }),
    };
  });

  const client = () =>
    createGraphqlClient({
      shop: SHOP,
      apiVersion: "2026-10",
      tokens,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

  /** Responde en orden la lista de respuestas, una por petición. */
  function respond(...responses: (() => Response)[]) {
    let i = 0;
    server.use(
      http.post(URL, ({ request }) => {
        headers.push(request.headers.get("X-Shopify-Access-Token"));
        const next = responses[Math.min(i, responses.length - 1)]!;
        i += 1;
        return next();
      }),
    );
  }

  it("envía el token y devuelve los datos", async () => {
    respond(ok);
    expect(await client().request("query { shop { name } }")).toEqual({
      shop: { name: "Pereda" },
    });
    expect(headers).toEqual(["shpat_0"]);
  });

  it("reintenta con espera creciente ante THROTTLED y 5xx", async () => {
    respond(
      () =>
        HttpResponse.json({
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        }),
      () => new HttpResponse(null, { status: 502 }),
      ok,
    );
    await expect(client().request("{ shop { name } }")).resolves.toBeDefined();
    expect(delays).toEqual([500, 1000]);
  });

  it("respeta Retry-After ante un 429", async () => {
    respond(
      () =>
        new HttpResponse(null, {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      ok,
    );
    await client().request("{ shop { name } }");
    expect(delays).toEqual([2000]);
  });

  it("reintenta ante errores de red y se rinde tras el máximo de intentos", async () => {
    respond(() => HttpResponse.error());
    const error = await client()
      .request("{ shop { name } }")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShopifyUnavailableError);
    expect((error as ShopifyError).retryable).toBe(true);
    expect(delays).toEqual([500, 1000, 2000, 4000]);
  });

  it("no reintenta ante otros 4xx ni errores de GraphQL", async () => {
    respond(() => new HttpResponse(null, { status: 400 }));
    await expect(client().request("{ x }")).rejects.toThrow("respondió 400");
    respond(() =>
      HttpResponse.json({ errors: [{ message: "Field 'x' doesn't exist" }] }),
    );
    await expect(client().request("{ x }")).rejects.toThrow(
      "Field 'x' doesn't exist",
    );
    respond(() => HttpResponse.json({}));
    await expect(client().request("{ x }")).rejects.toThrow("sin datos");
    expect(delays).toEqual([]);
  });

  it("ante un 401 renueva el token y reintenta una sola vez", async () => {
    respond(() => new HttpResponse(null, { status: 401 }), ok);
    await client().request("{ shop { name } }");
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    expect(headers).toEqual(["shpat_0", "shpat_1"]);

    respond(() => new HttpResponse(null, { status: 401 }));
    await expect(client().request("{ shop { name } }")).rejects.toBeInstanceOf(
      ShopifyAuthError,
    );
  });

  it("un 403 es falta de permisos", async () => {
    respond(() => new HttpResponse(null, { status: 403 }));
    await expect(client().request("{ x }")).rejects.toThrow("no tiene permiso");
  });

  it("un error de autenticación al pedir el token no se reintenta", async () => {
    tokens.getToken.mockRejectedValue(new ShopifyAuthError("credenciales"));
    respond(ok);
    await expect(client().request("{ x }")).rejects.toBeInstanceOf(
      ShopifyAuthError,
    );
    expect(delays).toEqual([]);
  });
});

describe("backoffDelay y userErrors", () => {
  it("la espera se duplica con un tope", () => {
    expect([1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a))).toEqual([
      500, 1000, 2000, 4000, 8000, 8000,
    ]);
  });

  it("los userErrors se convierten en ShopifyUserError", () => {
    expect(() => assertNoUserErrors([])).not.toThrow();
    expect(() => assertNoUserErrors(undefined)).not.toThrow();
    const error = (() => {
      try {
        assertNoUserErrors([{ field: ["email"], message: "Email is invalid" }]);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ShopifyUserError);
    expect((error as ShopifyUserError).message).toBe("Email is invalid");
  });
});
