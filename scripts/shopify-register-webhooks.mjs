// Suscribe la tienda a los webhooks que usa el sistema (por entorno).
// Uso: APP_URL=https://sistema.pereda.pe pnpm shopify:register-webhooks
// Requiere SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET y
// SHOPIFY_API_VERSION. Se valida contra la tienda de desarrollo en el spike (4.1).
const TOPICS = [
  "CUSTOMERS_UPDATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDER_TRANSACTIONS_CREATE",
];

const {
  SHOPIFY_STORE_DOMAIN: shop,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
} = process.env;
const version = process.env.SHOPIFY_API_VERSION;
const appUrl = process.env.APP_URL;
for (const [name, value] of Object.entries({
  SHOPIFY_STORE_DOMAIN: shop,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_API_VERSION: version,
  APP_URL: appUrl,
})) {
  if (!value) {
    console.error(`Falta ${name}`);
    process.exit(1);
  }
}
if (!appUrl.startsWith("https://")) {
  console.error(
    "APP_URL debe ser https: Shopify no envía webhooks a localhost.",
  );
  process.exit(1);
}

const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "client_credentials",
    client_id: SHOPIFY_CLIENT_ID,
    client_secret: SHOPIFY_CLIENT_SECRET,
  }),
});
if (!tokenResponse.ok) {
  console.error(`No se obtuvo el token (${tokenResponse.status})`);
  process.exit(1);
}
const { access_token: token } = await tokenResponse.json();

async function graphql(query, variables) {
  const response = await fetch(
    `https://${shop}/admin/api/${version}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const uri = new URL("/api/webhooks/shopify", appUrl).toString();
const existing = await graphql(`
  query {
    webhookSubscriptions(first: 100) {
      nodes {
        id
        topic
        uri
      }
    }
  }
`);
for (const topic of TOPICS) {
  if (
    existing.webhookSubscriptions.nodes.some(
      (s) => s.topic === topic && s.uri === uri,
    )
  ) {
    console.log(`= ${topic} ya estaba suscrito`);
    continue;
  }
  const data = await graphql(
    `
      mutation Subscribe(
        $topic: WebhookSubscriptionTopic!
        $sub: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          webhookSubscription {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { topic, sub: { uri, format: "JSON" } },
  );
  const { userErrors } = data.webhookSubscriptionCreate;
  if (userErrors.length) {
    console.error(`✗ ${topic}:`, userErrors.map((e) => e.message).join("; "));
    process.exitCode = 1;
  } else {
    console.log(`+ ${topic} → ${uri}`);
  }
}
