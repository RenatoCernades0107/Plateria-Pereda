import { createHmac, timingSafeEqual } from "node:crypto";

/** Firma de Shopify: HMAC-SHA256 del body crudo con el client secret, en base64. */
export function signWebhook(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

/** Verifica X-Shopify-Hmac-Sha256 en tiempo constante. */
export function verifyWebhookHmac(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = Buffer.from(signWebhook(rawBody, secret), "base64");
  const received = Buffer.from(header, "base64");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
