// Firma y envía un webhook de Shopify a la app local, como lo haría la tienda.
// Uso: pnpm shopify:webhook <topic> <fixture>
//   pnpm shopify:webhook customers/update customers-update
// <fixture> es una ruta a un JSON o un nombre de tests/fixtures/shopify/webhooks/.
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// Mismos valores que src/server/shopify-webhooks/config.ts para el modo fake.
const FAKE_WEBHOOK_SECRET = "pereda-fake-webhook-secret";
const FAKE_SHOP_DOMAIN = "pereda-fake.myshopify.com";

const [topic, fixture] = process.argv.slice(2);
if (!topic || !fixture) {
  console.error("Uso: pnpm shopify:webhook <topic> <fixture>");
  process.exit(1);
}

const path = existsSync(fixture)
  ? fixture
  : `tests/fixtures/shopify/webhooks/${fixture.replace(/\.json$/, "")}.json`;
if (!existsSync(path)) {
  console.error(`No existe el fixture ${path}`);
  process.exit(1);
}

const body = readFileSync(path, "utf8");
const secret = process.env.SHOPIFY_CLIENT_SECRET || FAKE_WEBHOOK_SECRET;
const shop = process.env.SHOPIFY_STORE_DOMAIN || FAKE_SHOP_DOMAIN;
const url = new URL(
  "/api/webhooks/shopify",
  process.env.APP_URL ?? "http://localhost:3000",
);

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": randomUUID(),
    "X-Shopify-API-Version": process.env.SHOPIFY_API_VERSION || "2026-10",
    "X-Shopify-Hmac-Sha256": createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("base64"),
  },
  body,
}).catch((error) => {
  console.error(`No se pudo llamar a ${url}. ¿Está corriendo la app?`, error);
  process.exit(1);
});

console.log(`${response.status}`, await response.text());
if (!response.ok) process.exit(1);
