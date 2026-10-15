// Borra de Shopify los datos que dejó `pnpm shopify:spike` (órdenes, empresas y clientes).
// Uso: pnpm shopify:cleanup-spike                 (solo lista lo que borraría)
//      pnpm shopify:cleanup-spike --borrar        (borra)
//      pnpm shopify:cleanup-spike --dias 90       (ventana de búsqueda; por defecto 30)
// Solo toca lo que lleva la marca de una corrida del spike: etiqueta SPIKE-AAAAMMDDHHMMSS,
// o ese mismo texto en el nombre de la empresa, el apellido o el email del contacto.
// Orden: órdenes → empresas → clientes (Shopify no borra clientes ni empresas con órdenes).
const env = process.env;
const shop = env.SHOPIFY_STORE_DOMAIN;
const version = env.SHOPIFY_API_VERSION || "2026-10";
const args = process.argv.slice(2);
const apply = args.includes("--borrar");
const daysIndex = args.indexOf("--dias");
const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 30;

if (!Number.isInteger(days) || days < 1) {
  console.error("--dias debe ser un entero positivo (ej. --dias 90).");
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

// Marca de una corrida del spike (ver RUN en shopify-spike.mjs).
const MARK = /SPIKE-\d{14}/i;
const TAG = /^SPIKE-\d{14}$/i;
const since = new Date(Date.now() - days * 86_400_000)
  .toISOString()
  .slice(0, 10);

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
  console.error(
    `No se obtuvo el token (HTTP ${tokenResponse.status}). ¿La app está instalada en ${shop}?`,
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function graphql(query, variables = {}) {
  for (let attempt = 0; ; attempt++) {
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
    const throttled = JSON.stringify(body.errors ?? "").includes("THROTTLED");
    if (throttled && attempt < 5) {
      await sleep(2000);
      continue;
    }
    if (!response.ok || body.errors) {
      throw new Error(
        `HTTP ${response.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`,
      );
    }
    return body.data;
  }
}

/** Recorre una conexión paginada y devuelve todos sus nodos. */
async function fetchAll(query, path, variables = {}) {
  const nodes = [];
  let after = null;
  for (;;) {
    const data = await graphql(query, { ...variables, after });
    const connection = data[path];
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
}

const summary = { borrados: 0, fallidos: 0 };
function ok(label) {
  summary.borrados += 1;
  console.log(`  ✓ ${label}`);
}
function fail(label, reason) {
  summary.fallidos += 1;
  console.error(`  ✗ ${label}: ${reason}`);
}

console.log(
  `Tienda: ${shop} · búsqueda desde ${since} · ${apply ? "BORRANDO" : "solo listado (agrega --borrar para borrar)"}\n`,
);

// 1. Órdenes
const orders = (
  await fetchAll(
    `query ($after: String, $q: String!) {
      orders(first: 100, after: $after, query: $q) {
        nodes { id name tags cancelledAt }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    "orders",
    { q: `created_at:>=${since}` },
  )
).filter((order) => order.tags.some((tag) => TAG.test(tag)));
console.log(`Órdenes del spike: ${orders.length}`);

/** Cancela la orden sin reembolso, sin reponer inventario y sin avisar al cliente. */
async function cancelOrder(order) {
  // El argumento de reembolso cambió entre versiones: se prueba una forma y luego la otra.
  const variants = [
    "refund: false",
    "refundMethod: { originalPaymentMethodsRefund: false }",
  ];
  let lastError;
  for (const refundArg of variants) {
    try {
      const data = await graphql(
        `mutation ($id: ID!) {
          orderCancel(orderId: $id, reason: OTHER, restock: false, notifyCustomer: false, ${refundArg}) {
            userErrors { message }
          }
        }`,
        { id: order.id },
      );
      const errors = data.orderCancel.userErrors;
      if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
      // La cancelación es asíncrona: se espera a que la orden figure cancelada.
      for (let i = 0; i < 15; i++) {
        const check = await graphql(
          `query ($id: ID!) { order(id: $id) { cancelledAt } }`,
          { id: order.id },
        );
        if (check.order?.cancelledAt) return;
        await sleep(1000);
      }
      throw new Error("la cancelación tardó demasiado");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function deleteOrder(order) {
  const data = await graphql(
    `mutation ($id: ID!) {
      orderDelete(orderId: $id) {
        deletedId
        userErrors { message }
      }
    }`,
    { id: order.id },
  );
  const errors = data.orderDelete.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
}

for (const order of orders) {
  console.log(`- ${order.name} [${order.tags.join(", ")}]`);
  if (!apply) continue;
  try {
    try {
      await deleteOrder(order);
    } catch {
      // Shopify solo borra órdenes canceladas o archivadas: se cancela y se reintenta.
      if (!order.cancelledAt) await cancelOrder(order);
      await deleteOrder(order);
    }
    ok(`${order.name} borrada`);
  } catch (error) {
    fail(
      order.name,
      `${error.message}. Queda cancelada si se pudo; bórrala a mano en Pedidos.`,
    );
  }
  await sleep(300);
}

// 2. Empresas (se buscan por el nombre: Shopify no las filtra por etiqueta)
const companies = (
  await fetchAll(
    `query ($after: String) {
      companies(first: 100, after: $after) {
        nodes { id name }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    "companies",
  ).catch((error) => {
    console.error(`No se pudieron leer las empresas: ${error.message}`);
    return [];
  })
).filter((company) => MARK.test(company.name));
console.log(`\nEmpresas del spike: ${companies.length}`);
for (const company of companies) {
  console.log(`- ${company.name}`);
  if (!apply) continue;
  try {
    const data = await graphql(
      `mutation ($id: ID!) {
        companyDelete(id: $id) {
          deletedCompanyId
          userErrors { message }
        }
      }`,
      { id: company.id },
    );
    const errors = data.companyDelete.userErrors;
    if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
    ok(`${company.name} borrada`);
  } catch (error) {
    fail(
      company.name,
      `${error.message}. Bórrala a mano en Clientes → Empresas.`,
    );
  }
  await sleep(300);
}

// 3. Clientes (etiqueta, apellido o email con la marca del spike)
const customers = (
  await fetchAll(
    `query ($after: String, $q: String!) {
      customers(first: 100, after: $after, query: $q) {
        nodes { id displayName email lastName tags }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    "customers",
    { q: `created_at:>=${since}` },
  )
).filter(
  (customer) =>
    customer.tags.some((tag) => TAG.test(tag)) ||
    MARK.test(customer.lastName ?? "") ||
    MARK.test(customer.email ?? ""),
);
console.log(`\nClientes del spike: ${customers.length}`);
for (const customer of customers) {
  const label = `${customer.displayName} <${customer.email ?? "sin email"}>`;
  console.log(`- ${label}`);
  if (!apply) continue;
  try {
    const data = await graphql(
      `mutation ($input: CustomerDeleteInput!) {
        customerDelete(input: $input) {
          deletedCustomerId
          userErrors { message }
        }
      }`,
      { input: { id: customer.id } },
    );
    const errors = data.customerDelete.userErrors;
    if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
    ok(`${label} borrado`);
  } catch (error) {
    fail(label, `${error.message}. Bórralo a mano en Clientes.`);
  }
  await sleep(300);
}

console.log(
  apply
    ? `\nListo: ${summary.borrados} borrados, ${summary.fallidos} con error.`
    : "\nNo se borró nada. Si la lista es correcta: pnpm shopify:cleanup-spike --borrar",
);
if (summary.fallidos) process.exitCode = 1;
