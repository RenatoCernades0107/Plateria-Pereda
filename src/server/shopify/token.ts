import { ShopifyAuthError, ShopifyUnavailableError } from "./errors";

export type StoredToken = { accessToken: string; expiresAt: Date };

/** Dónde se guarda el token entre peticiones (tabla `shopify_tokens` en producción). */
export interface TokenStore {
  read(shop: string): Promise<StoredToken | null>;
  write(shop: string, token: StoredToken): Promise<void>;
  clear(shop: string): Promise<void>;
}

export type TokenProvider = {
  getToken(): Promise<string>;
  /** Descarta el token guardado (p. ej., tras un 401) para pedir uno nuevo. */
  invalidate(): Promise<void>;
};

type Options = {
  shop: string;
  clientId: string;
  clientSecret: string;
  store: TokenStore;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Se renueva cuando faltan menos de estos milisegundos para que venza. */
  refreshMarginMs?: number;
};

/**
 * Token de la app con client credentials (D19): Shopify lo entrega por 24 h y el
 * sistema lo renueva solo antes de que venza.
 */
export function createTokenProvider({
  shop,
  clientId,
  clientSecret,
  store,
  fetch: fetchImpl = globalThis.fetch,
  now = () => new Date(),
  refreshMarginMs = 10 * 60 * 1000,
}: Options): TokenProvider {
  let pending: Promise<string> | null = null;

  async function requestToken(): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        // Shopify espera el pedido del token como formulario, no como JSON.
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new ShopifyUnavailableError(
        `No se pudo pedir el token a Shopify: ${(error as Error).message}`,
      );
    }
    if (response.status >= 500 || response.status === 429) {
      throw new ShopifyUnavailableError(
        `Shopify respondió ${response.status} al pedir el token`,
      );
    }
    if (!response.ok) {
      throw new ShopifyAuthError(
        `Shopify rechazó las credenciales de la app (${response.status})`,
      );
    }
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) {
      throw new ShopifyAuthError("Shopify no devolvió un token");
    }
    const expiresAt = new Date(
      now().getTime() + (body.expires_in ?? 86_400) * 1000,
    );
    await store.write(shop, { accessToken: body.access_token, expiresAt });
    return body.access_token;
  }

  return {
    async getToken() {
      const stored = await store.read(shop);
      if (
        stored &&
        stored.expiresAt.getTime() - now().getTime() > refreshMarginMs
      ) {
        return stored.accessToken;
      }
      // Varias peticiones a la vez comparten una sola renovación.
      pending ??= requestToken().finally(() => {
        pending = null;
      });
      return pending;
    },
    async invalidate() {
      await store.clear(shop);
    },
  };
}
