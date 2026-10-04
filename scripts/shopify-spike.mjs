// Spike del Paso 4.1: prueba contra la tienda de desarrollo cada operación que el
// sistema necesita y guarda un reporte en tests/fixtures/shopify/spike/.
// Uso: pnpm shopify:spike        (crea datos de prueba con la etiqueta SPIKE-…)
// Requiere SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET y
// SHOPIFY_API_VERSION. Nunca usar con la tienda de producción.
import { mkdirSync, writeFileSync } from "node:fs";

const env = process.env;
const shop = env.SHOPIFY_STORE_DOMAIN;
const version = env.SHOPIFY_API_VERSION || "2026-10";
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

const RUN = `SPIKE-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const report = { run: RUN, shop, version, steps: [] };
const ctx = {};

async function step(name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    report.steps.push({ name, ok: true, ms: Date.now() - started, result });
    console.log(`✓ ${name}`);
    return result;
  } catch (error) {
    report.steps.push({
      name,
      ok: false,
      ms: Date.now() - started,
      error: error.details ?? error.message,
    });
    console.log(`✗ ${name}: ${error.message}`);
    return undefined;
  }
}

async function graphql(query, variables = {}) {
  const response = await fetch(
    `https://${shop}/admin/api/${version}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ctx.token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors) {
    const error = new Error(
      `HTTP ${response.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`,
    );
    error.details = { status: response.status, errors: body.errors ?? body };
    throw error;
  }
  return body.data;
}

/** Lanza si la mutación devolvió userErrors. */
function check(payload) {
  if (payload?.userErrors?.length) {
    const error = new Error(
      payload.userErrors.map((e) => e.message).join("; "),
    );
    error.details = { userErrors: payload.userErrors };
    throw error;
  }
  return payload;
}

/** Repite una búsqueda hasta que devuelva resultados (el índice de Shopify tarda). */
async function poll(search, { tries = 10, delayMs = 2000 } = {}) {
  const started = Date.now();
  for (let i = 0; i < tries; i++) {
    const nodes = await search();
    if (nodes.length) return { foundAfterMs: Date.now() - started, nodes };
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { foundAfterMs: null, nodes: [] };
}

const money = (amount) => ({
  shopMoney: { amount, currencyCode: ctx.currency ?? "PEN" },
});

// 1. Token con client credentials
await step("token client credentials", async () => {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
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
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    // Shopify a veces responde HTML o vacío en los errores.
  }
  if (!response.ok || !body.access_token) {
    const error = new Error(
      `HTTP ${response.status}: ${text.slice(0, 300) || "(respuesta vacía)"}`,
    );
    error.details = {
      status: response.status,
      body: text.slice(0, 1000),
      requestId: response.headers.get("x-request-id"),
      // Revisiones de formato, sin mostrar las credenciales.
      clientIdLength: env.SHOPIFY_CLIENT_ID.length,
      clientIdHasSpacesOrQuotes: /[\s"']/.test(env.SHOPIFY_CLIENT_ID),
      clientSecretPrefix: env.SHOPIFY_CLIENT_SECRET.slice(0, 6),
      clientSecretHasSpacesOrQuotes: /[\s"']/.test(env.SHOPIFY_CLIENT_SECRET),
      hint: "400 suele indicar que la app no está instalada en la tienda o que la tienda no pertenece a la misma organización que la app; 401, credenciales incorrectas.",
    };
    throw error;
  }
  ctx.token = body.access_token;
  return { expires_in: body.expires_in, scope: body.scope };
});
if (!ctx.token) {
  save();
  process.exit(1);
}

// 2. Tienda, plan y permisos concedidos
await step("tienda y permisos", async () => {
  const data = await graphql(`
    {
      shop {
        name
        myshopifyDomain
        currencyCode
        plan {
          publicDisplayName
          partnerDevelopment
          shopifyPlus
        }
      }
      currentAppInstallation {
        accessScopes {
          handle
        }
      }
    }
  `);
  ctx.currency = data.shop.currencyCode;
  return {
    ...data.shop,
    scopes: data.currentAppInstallation.accessScopes.map((s) => s.handle),
  };
});

// 3. Cliente persona
await step("crear cliente persona", async () => {
  const data = await graphql(
    `
      mutation ($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            displayName
            note
            defaultEmailAddress {
              emailAddress
            }
            defaultPhoneNumber {
              phoneNumber
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: {
        firstName: "Spike",
        lastName: RUN,
        email: `${RUN.toLowerCase()}@example.com`,
        phone: `+519${String(Date.now()).slice(-8)}`,
        note: "Cliente de prueba del spike",
        tags: [RUN],
      },
    },
  );
  ctx.customer = check(data.customerCreate).customer;
  return ctx.customer;
});

await step("buscar clientes (espera al índice)", async () => {
  const search = async (q) =>
    (
      await graphql(
        `
          query ($q: String) {
            customers(first: 5, query: $q) {
              nodes {
                id
                displayName
              }
            }
          }
        `,
        { q },
      )
    ).customers.nodes;
  return {
    porEmail: await poll(() =>
      search(`email:${RUN.toLowerCase()}@example.com`),
    ),
    porTexto: await poll(() => search("Spike"), { tries: 3 }),
    porTelefono: await poll(
      () =>
        search(`phone:${ctx.customer?.defaultPhoneNumber?.phoneNumber ?? ""}`),
      { tries: 3 },
    ),
  };
});

// 4. Empresa como Company (P14 = b)
await step("crear company con contacto y ubicación", async () => {
  const data = await graphql(
    `
      mutation ($input: CompanyCreateInput!) {
        companyCreate(input: $input) {
          company {
            id
            name
            externalId
            contacts(first: 5) {
              nodes {
                id
                customer {
                  id
                  displayName
                }
              }
            }
            locations(first: 5) {
              nodes {
                id
                name
              }
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      input: {
        company: { name: `Empresa ${RUN} S.A.C.`, externalId: "20100047218" },
        companyContact: {
          firstName: "Contacto",
          lastName: RUN,
          email: `contacto-${RUN.toLowerCase()}@example.com`,
        },
        companyLocation: {
          name: "Sede principal",
          // Perú exige la región (zoneCode); con billingSameAsShipping se envía la de envío.
          shippingAddress: {
            address1: "Av. Prueba 123",
            city: "Lima",
            zoneCode: "LIM",
            countryCode: "PE",
          },
          billingSameAsShipping: true,
        },
      },
    },
  );
  ctx.company = check(data.companyCreate).company;
  return ctx.company;
});

// 5. Productos
await step("buscar productos", async () => {
  const data = await graphql(`
    {
      products(first: 3) {
        nodes {
          id
          title
          featuredMedia {
            preview {
              image {
                url
              }
            }
          }
          priceRangeV2 {
            minVariantPrice {
              amount
            }
            maxVariantPrice {
              amount
            }
          }
          variants(first: 3) {
            nodes {
              id
              title
              price
              sku
              image {
                url
              }
            }
          }
        }
      }
    }
  `);
  return data.products.nodes;
});

const ORDER_FIELDS = `
  id name tags displayFinancialStatus displayFulfillmentStatus
  totalPriceSet { shopMoney { amount } }
  currentTotalPriceSet { shopMoney { amount } }
  totalReceivedSet { shopMoney { amount } }
  totalOutstandingSet { shopMoney { amount } }
  lineItems(first: 10) { nodes { id title quantity currentQuantity unfulfilledQuantity originalUnitPriceSet { shopMoney { amount } } } }
  transactions { id kind status gateway amountSet { shopMoney { amount } } }
`;

// 6. Orden con líneas personalizadas y adelanto incluido (P43)
await step("crear orden con adelanto (orderCreate)", async () => {
  if (!ctx.customer) throw new Error("No hay cliente");
  const data = await graphql(
    `mutation ($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { ${ORDER_FIELDS} }
        userErrors { field message }
      }
    }`,
    {
      order: {
        customerId: ctx.customer.id,
        currency: ctx.currency,
        tags: [RUN],
        note: "Orden de prueba del spike",
        lineItems: [
          {
            title: `Restauración ${RUN}-1`,
            quantity: 1,
            priceSet: money("150.00"),
            requiresShipping: false,
            taxable: true,
          },
          {
            title: `Restauración ${RUN}-2`,
            quantity: 1,
            priceSet: money("250.00"),
            requiresShipping: false,
            taxable: true,
          },
        ],
        transactions: [
          {
            kind: "SALE",
            status: "SUCCESS",
            gateway: "Yape",
            amountSet: money("200.00"),
          },
        ],
      },
      options: { inventoryBehaviour: "BYPASS", sendReceipt: false },
    },
  );
  ctx.order = check(data.orderCreate).order;
  return ctx.order;
});

await step("buscar orden por etiqueta (espera al índice)", async () =>
  poll(
    async () =>
      (
        await graphql(
          `
            query ($q: String!) {
              orders(first: 1, query: $q) {
                nodes {
                  id
                  name
                  tags
                }
              }
            }
          `,
          { q: `tag:'${RUN}'` },
        )
      ).orders.nodes,
  ),
);

// Idempotencia: la misma clave dos veces debería devolver la misma orden, sin duplicar.
await step("orderCreate idempotente (@idempotent)", async () => {
  if (!ctx.customer) throw new Error("No hay cliente");
  const key = `${RUN}-idem`;
  const create = async () =>
    check(
      (
        await graphql(
          `mutation ($order: OrderCreateOrderInput!) {
            orderCreate(order: $order, options: { inventoryBehaviour: BYPASS, sendReceipt: false }) @idempotent(key: "${key}") {
              order { id name } userErrors { field message }
            }
          }`,
          {
            order: {
              customerId: ctx.customer.id,
              currency: ctx.currency,
              tags: [RUN, "idempotente"],
              lineItems: [
                {
                  title: `Restauración ${RUN}-I1`,
                  quantity: 1,
                  priceSet: money("10.00"),
                  requiresShipping: false,
                },
              ],
            },
          },
        )
      ).orderCreate,
    ).order;
  const first = await create();
  const second = await create();
  return { first, second, mismaOrden: first.id === second.id };
});

// 7. Orden a nombre de la empresa
await step("crear orden para la company", async () => {
  const contact = ctx.company?.contacts.nodes[0];
  const location = ctx.company?.locations.nodes[0];
  if (!contact || !location) throw new Error("No hay company");
  const data = await graphql(
    `
      mutation ($order: OrderCreateOrderInput!) {
        orderCreate(
          order: $order
          options: { inventoryBehaviour: BYPASS, sendReceipt: false }
        ) {
          order {
            id
            name
            purchasingEntity {
              __typename
              ... on PurchasingCompany {
                company {
                  name
                }
                location {
                  name
                }
                contact {
                  customer {
                    displayName
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      order: {
        customerId: contact.customer.id,
        companyLocationId: location.id,
        currency: ctx.currency,
        tags: [RUN, "empresa"],
        lineItems: [
          {
            title: `Restauración ${RUN}-E1`,
            quantity: 1,
            priceSet: money("100.00"),
            requiresShipping: false,
          },
        ],
      },
    },
  );
  return check(data.orderCreate).order;
});

// 8. Edición: agregar una pieza y quitar otra
await step("editar orden (agregar y quitar línea)", async () => {
  if (!ctx.order) throw new Error("No hay orden");
  const begin = check(
    (
      await graphql(
        `
          mutation ($id: ID!) {
            orderEditBegin(id: $id) {
              calculatedOrder {
                id
                lineItems(first: 10) {
                  nodes {
                    id
                    title
                    quantity
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        { id: ctx.order.id },
      )
    ).orderEditBegin,
  );
  const calc = begin.calculatedOrder;
  check(
    (
      await graphql(
        `
          mutation ($id: ID!, $title: String!, $price: MoneyInput!) {
            orderEditAddCustomItem(
              id: $id
              title: $title
              price: $price
              quantity: 1
              requiresShipping: false
            ) {
              calculatedLineItem {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          id: calc.id,
          title: `Restauración ${RUN}-3`,
          price: { amount: "50.00", currencyCode: ctx.currency },
        },
      )
    ).orderEditAddCustomItem,
  );
  const first = calc.lineItems.nodes[0];
  check(
    (
      await graphql(
        `
          mutation ($id: ID!, $lineItemId: ID!) {
            orderEditSetQuantity(
              id: $id
              lineItemId: $lineItemId
              quantity: 0
            ) {
              calculatedOrder {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        { id: calc.id, lineItemId: first.id },
      )
    ).orderEditSetQuantity,
  );
  const commit = check(
    (
      await graphql(
        `mutation ($id: ID!) { orderEditCommit(id: $id, notifyCustomer: false, staffNote: "Spike: pieza anulada y pieza agregada") {
        order { ${ORDER_FIELDS} } userErrors { field message }
      } }`,
        { id: calc.id },
      )
    ).orderEditCommit,
  );
  ctx.order = commit.order;
  return commit.order;
});

// El adaptador relaciona cada línea con su línea "calculada" de la edición por el número
// final del id: se verifica sin confirmar la edición.
await step("ids de líneas calculadas = ids de líneas", async () => {
  if (!ctx.order) throw new Error("No hay orden");
  const data = await graphql(
    `
      mutation ($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            lineItems(first: 20) {
              nodes {
                id
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: ctx.order.id },
  );
  const calc = check(data.orderEditBegin).calculatedOrder.lineItems.nodes.map(
    (n) => n.id,
  );
  const lines = ctx.order.lineItems.nodes
    .filter((n) => n.currentQuantity > 0)
    .map((n) => n.id);
  const suffix = (id) => id.split("/").pop();
  return {
    lines,
    calc,
    coinciden: lines.every((id) => calc.some((c) => suffix(c) === suffix(id))),
  };
});

// 9. Pago del saldo (orderCreateManualPayment sin monto)
await step("registrar pago del saldo", async () => {
  if (!ctx.order) throw new Error("No hay orden");
  // Con nombre falla si el método manual no existe en Ajustes → Pagos de la tienda.
  const conNombre = await graphql(
    `
      mutation ($id: ID!) {
        orderCreateManualPayment(id: $id, paymentMethodName: "Efectivo") {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: ctx.order.id },
  );
  if (!conNombre.orderCreateManualPayment.userErrors.length) {
    const data = await graphql(
      `query ($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
      {
        id: ctx.order.id,
      },
    );
    ctx.order = data.order;
    return { conNombre: "ok", order: ctx.order };
  }
  const sinNombre = await graphql(
    `mutation ($id: ID!) {
      orderCreateManualPayment(id: $id) {
        order { ${ORDER_FIELDS} } userErrors { field message }
      }
    }`,
    { id: ctx.order.id },
  );
  ctx.order = check(sinNombre.orderCreateManualPayment).order;
  return {
    conNombre: conNombre.orderCreateManualPayment.userErrors,
    sinNombre: "ok",
    order: ctx.order,
  };
});

// 10. Preparar (fulfill) una línea (P44)
await step("marcar una línea como preparada", async () => {
  if (!ctx.order) throw new Error("No hay orden");
  const data = await graphql(
    `
      query ($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 5) {
            nodes {
              id
              status
              lineItems(first: 10) {
                nodes {
                  id
                  remainingQuantity
                  lineItem {
                    id
                    title
                  }
                }
              }
            }
          }
        }
      }
    `,
    { id: ctx.order.id },
  );
  const fo = data.order.fulfillmentOrders.nodes.find((n) =>
    n.lineItems.nodes.some((i) => i.remainingQuantity > 0),
  );
  if (!fo)
    return {
      fulfillmentOrders: data.order.fulfillmentOrders.nodes,
      note: "Sin fulfillment orders",
    };
  const item = fo.lineItems.nodes.find((i) => i.remainingQuantity > 0);
  const created = await graphql(
    `
      mutation ($f: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $f) {
          fulfillment {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      f: {
        notifyCustomer: false,
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: fo.id,
            fulfillmentOrderLineItems: [
              { id: item.id, quantity: item.remainingQuantity },
            ],
          },
        ],
      },
    },
  );
  return {
    fulfillmentOrder: fo,
    fulfillment: check(created.fulfillmentCreate).fulfillment,
  };
});

// 11. Reembolso parcial de un pago manual
await step("reembolsar parte de un pago", async () => {
  if (!ctx.order) throw new Error("No hay orden");
  const sale = ctx.order.transactions.find(
    (t) => t.kind === "SALE" && t.status === "SUCCESS",
  );
  if (!sale) throw new Error("No hay pago para reembolsar");
  const data = await graphql(
    `
      mutation ($input: RefundInput!, $key: String!) {
        refundCreate(input: $input) @idempotent(key: $key) {
          refund {
            id
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
          }
          order {
            displayFinancialStatus
            totalReceivedSet {
              shopMoney {
                amount
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      key: `${RUN}-refund`,
      input: {
        orderId: ctx.order.id,
        note: "Spike: reembolso de prueba",
        notify: false,
        transactions: [
          {
            orderId: ctx.order.id,
            parentId: sale.id,
            kind: "REFUND",
            gateway: sale.gateway,
            amount: "20.00",
          },
        ],
      },
    },
  );
  return check(data.refundCreate);
});

// 12. Webhooks suscritos
await step("webhooks suscritos", async () => {
  const data = await graphql(`
    {
      webhookSubscriptions(first: 50) {
        nodes {
          id
          topic
          uri
          apiVersion {
            handle
          }
        }
      }
    }
  `);
  return data.webhookSubscriptions.nodes;
});

save();

function save() {
  const dir = "tests/fixtures/shopify/spike";
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/reporte-${RUN.slice(6)}.json`;
  // El token no se guarda; los datos son de prueba de la tienda de desarrollo.
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  const ok = report.steps.filter((s) => s.ok).length;
  console.log(
    `\n${ok}/${report.steps.length} pasos correctos. Reporte: ${file}`,
  );
}
