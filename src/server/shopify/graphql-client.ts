import {
  ShopifyAuthError,
  ShopifyError,
  ShopifyUnavailableError,
  ShopifyUserError,
} from "./errors";
import type { TokenProvider } from "./token";

type Options = {
  shop: string;
  apiVersion: string;
  tokens: TokenProvider;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
};

export type GraphqlClient = {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
};

/** Espera exponencial: 500 ms, 1 s, 2 s… con tope de 8 s. */
export function backoffDelay(attempt: number, baseMs = 500, maxMs = 8_000) {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

/**
 * Cliente de la Admin API de GraphQL con versión fijada, timeout, reintentos ante
 * límite de uso (THROTTLED, 429), errores 5xx y de red, y una renovación del token
 * ante un 401.
 */
export function createGraphqlClient({
  shop,
  apiVersion,
  tokens,
  fetch: fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxAttempts = 4,
  timeoutMs = 15_000,
  baseDelayMs = 500,
}: Options): GraphqlClient {
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  return {
    async request<T>(query: string, variables?: Record<string, unknown>) {
      let refreshedToken = false;
      let lastError: ShopifyError = new ShopifyUnavailableError(
        "Shopify no responde",
      );

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": await tokens.getToken(),
            },
            body: JSON.stringify({ query, variables }),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          if (error instanceof ShopifyError && !error.retryable) throw error;
          lastError =
            error instanceof ShopifyError
              ? error
              : new ShopifyUnavailableError(
                  `Error de red con Shopify: ${(error as Error).message}`,
                );
          await sleep(backoffDelay(attempt, baseDelayMs));
          continue;
        }

        if (response.status === 401) {
          if (refreshedToken) {
            throw new ShopifyAuthError("Shopify rechazó el token renovado");
          }
          refreshedToken = true;
          await tokens.invalidate();
          attempt--; // renovar el token no cuenta como reintento
          continue;
        }
        if (response.status === 403) {
          throw new ShopifyAuthError(
            "La app no tiene permiso para esta operación en Shopify",
          );
        }
        if (response.status === 429 || response.status >= 500) {
          lastError = new ShopifyUnavailableError(
            `Shopify respondió ${response.status}`,
          );
          const retryAfter = Number(response.headers.get("Retry-After"));
          await sleep(
            retryAfter > 0
              ? retryAfter * 1000
              : backoffDelay(attempt, baseDelayMs),
          );
          continue;
        }
        if (!response.ok) {
          throw new ShopifyError(`Shopify respondió ${response.status}`);
        }

        const body = (await response.json()) as GraphqlResponse<T>;
        if (body.errors?.length) {
          if (body.errors.some((e) => e.extensions?.code === "THROTTLED")) {
            lastError = new ShopifyUnavailableError(
              "Shopify limitó las peticiones (THROTTLED)",
            );
            await sleep(backoffDelay(attempt, baseDelayMs));
            continue;
          }
          throw new ShopifyError(body.errors.map((e) => e.message).join("; "));
        }
        if (body.data === undefined) {
          throw new ShopifyError("Shopify respondió sin datos");
        }
        return body.data;
      }
      throw lastError;
    },
  };
}

/** Lanza ShopifyUserError si la mutación devolvió userErrors. */
export function assertNoUserErrors(
  userErrors: { field?: string[] | null; message: string }[] | undefined,
) {
  if (userErrors?.length) {
    throw new ShopifyUserError(
      userErrors.map((e) => ({ field: e.field ?? null, message: e.message })),
    );
  }
}
