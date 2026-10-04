// Importa (o actualiza) en el sistema los clientes de Shopify (Paso 6.6).
// Uso: pnpm shopify:import-customers  (con la app corriendo; APP_URL para producción)
// Es idempotente: se puede volver a ejecutar sin duplicar clientes.
const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Falta CRON_SECRET en .env.local. Ejecuta `pnpm env:local`.");
  process.exit(1);
}

const total = {
  created: 0,
  linked: 0,
  updated: 0,
  unchanged: 0,
  contact: 0,
  failed: 0,
};
const errors = [];
let after = null;

do {
  const url = new URL("/api/cron/shopify-import-customers", base);
  if (after) url.searchParams.set("after", after);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch (error) {
    console.error(`No se pudo llamar a ${url}. ¿Está corriendo la app?`, error);
    process.exit(1);
  }
  const body = await response.json();
  if (!response.ok) {
    console.error(`Error ${response.status}:`, body);
    if (after) console.error(`Para continuar desde aquí: cursor ${after}`);
    process.exit(1);
  }
  for (const key of Object.keys(total)) total[key] += body[key] ?? 0;
  errors.push(...(body.errors ?? []));
  after = body.nextCursor;
  console.log(
    `… nuevos: ${total.created} · vinculados: ${total.linked} · actualizados: ${total.updated} · sin cambios: ${total.unchanged}`,
  );
} while (after);

console.log(
  `Listo. Nuevos: ${total.created} · vinculados a clientes del sistema: ${total.linked} · actualizados: ${total.updated} · sin cambios: ${total.unchanged} · contactos de empresas: ${total.contact} · con error: ${total.failed}`,
);
for (const e of errors) console.log(`  ✗ ${e.customerId}: ${e.message}`);
if (total.failed > 0) process.exit(1);
