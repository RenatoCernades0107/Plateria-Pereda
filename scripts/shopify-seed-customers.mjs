// Crea clientes de prueba en la tienda de DESARROLLO para probar la importación (6.6).
// Uso: pnpm shopify:seed-customers --tienda-de-desarrollo [cantidad]   (por defecto 20)
//      pnpm shopify:seed-customers --tienda-de-desarrollo --borrar     (borra los de prueba)
// Los clientes llevan la etiqueta "prueba-sistema". Nunca usar con la tienda real.
const env = process.env;
const shop = env.SHOPIFY_STORE_DOMAIN;
const version = env.SHOPIFY_API_VERSION || "2026-10";
const TAG = "prueba-sistema";
const args = process.argv.slice(2);

if (!args.includes("--tienda-de-desarrollo")) {
  console.error(
    "Este script escribe en Shopify. Confirma que es la tienda de desarrollo con --tienda-de-desarrollo.",
  );
  process.exit(1);
}
for (const name of [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
]) {
  if (!env[name]) {
    console.error(`Falta ${name} en .env.local`);
    process.exit(1);
  }
}

const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  }),
});
const { access_token: token } = await tokenResponse.json().catch(() => ({}));
if (!token) {
  console.error(`No se obtuvo el token (HTTP ${tokenResponse.status}).`);
  process.exit(1);
}

async function graphql(query, variables = {}) {
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`,
    );
  }
  return body.data;
}

if (args.includes("--borrar")) {
  let deleted = 0;
  for (;;) {
    const data = await graphql(
      `
        query ($q: String!) {
          customers(first: 50, query: $q) {
            nodes {
              id
            }
          }
        }
      `,
      { q: `tag:${TAG}` },
    );
    if (data.customers.nodes.length === 0) break;
    const before = deleted;
    for (const { id } of data.customers.nodes) {
      const result = await graphql(
        `
          mutation ($input: CustomerDeleteInput!) {
            customerDelete(input: $input) {
              deletedCustomerId
              userErrors {
                message
              }
            }
          }
        `,
        { input: { id } },
      );
      const errors = result.customerDelete.userErrors;
      if (errors.length) console.error(`✗ ${id}: ${errors[0].message}`);
      else deleted += 1;
    }
    // El índice de búsqueda tarda: si nada se pudo borrar en esta vuelta, se termina.
    if (deleted === before) break;
  }
  console.log(`Clientes de prueba borrados: ${deleted}`);
  process.exit(0);
}

const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 20);
const NAMES = ["Lucía", "Jorge", "Carmen", "Miguel", "Rosa", "Andrés", "Elena"];
const LAST = ["Quispe", "Flores", "Rojas", "Huamán", "Vargas", "Mendoza"];
const run = String(Date.now()).slice(-5);
let created = 0;

for (let i = 0; i < count; i++) {
  const first = NAMES[i % NAMES.length];
  const last = LAST[i % LAST.length];
  // Variedad: algunos sin nombres, sin teléfono o sin email, como en la tienda real.
  const input = {
    firstName: i % 9 === 4 ? "" : first,
    lastName: `${last} Prueba`,
    email:
      i % 5 === 3
        ? undefined
        : `prueba-${run}-${i}@pereda-prueba.pe`.toLowerCase(),
    phone: i % 4 === 2 ? undefined : `+519${run}${String(i).padStart(3, "0")}`,
    note: "Cliente de prueba para la importación del sistema.",
    tags: [TAG],
  };
  const data = await graphql(
    `
      mutation ($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { input },
  );
  const errors = data.customerCreate.userErrors;
  if (errors.length) {
    console.error(
      `✗ ${input.firstName} ${input.lastName}: ${errors[0].message}`,
    );
  } else {
    created += 1;
  }
}
console.log(
  `Clientes de prueba creados: ${created} (etiqueta "${TAG}"). Ahora: pnpm shopify:import-customers`,
);
