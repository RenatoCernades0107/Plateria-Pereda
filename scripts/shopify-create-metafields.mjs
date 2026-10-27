// Crea en la tienda la definición del metafield de pedido "Sucursal" (custom.sucursal):
// el sistema guarda ahí la sucursal que cobró cada pago, y en la lista de pedidos se
// agrega como columna ("Editar columnas"). Es texto libre: las opciones se gestionan
// en Configuración → Sucursales del sistema.
// Uso: pnpm shopify:metafields
// Requiere SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET y
// SHOPIFY_API_VERSION.
const DEFINITION = {
  name: "Sucursal",
  namespace: "custom",
  key: "sucursal",
  type: "single_line_text_field",
  ownerType: "ORDER",
  description:
    "Sucursal que cobró el pago (la elige el sistema al registrarlo).",
};

const {
  SHOPIFY_STORE_DOMAIN: shop,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
} = process.env;
const version = process.env.SHOPIFY_API_VERSION;
for (const [name, value] of Object.entries({
  SHOPIFY_STORE_DOMAIN: shop,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_API_VERSION: version,
})) {
  if (!value) {
    console.error(`Falta ${name}`);
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

const existing = await graphql(
  `
    query Existing($namespace: String!, $key: String!) {
      metafieldDefinitions(
        first: 1
        ownerType: ORDER
        namespace: $namespace
        key: $key
      ) {
        nodes {
          id
          name
          type {
            name
          }
        }
      }
    }
  `,
  { namespace: DEFINITION.namespace, key: DEFINITION.key },
);
const found = existing.metafieldDefinitions.nodes[0];
if (found) {
  console.log(
    `= ${DEFINITION.namespace}.${DEFINITION.key} ya existe ("${found.name}", ${found.type.name})`,
  );
} else {
  const data = await graphql(
    `
      mutation Create($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { definition: DEFINITION },
  );
  const { userErrors } = data.metafieldDefinitionCreate;
  if (userErrors.length) {
    console.error(
      `✗ ${DEFINITION.namespace}.${DEFINITION.key}:`,
      userErrors.map((e) => e.message).join("; "),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `+ ${DEFINITION.namespace}.${DEFINITION.key} ("${DEFINITION.name}") creado`,
    );
  }
}
