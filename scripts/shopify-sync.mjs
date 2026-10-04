// Procesa el outbox de Shopify en local (en producción lo hace Vercel Cron).
// Uso: pnpm shopify:sync  (con `pnpm dev` corriendo)
const url = new URL(
  "/api/cron/shopify-sync",
  process.env.APP_URL ?? "http://localhost:3000",
);
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Falta CRON_SECRET en .env.local. Ejecuta `pnpm env:local`.");
  process.exit(1);
}

try {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.json();
  if (!response.ok) {
    console.error(`Error ${response.status}:`, body);
    process.exit(1);
  }
  console.log(
    `Procesados: ${body.processed} · enviados: ${body.ok} · por reintentar: ${body.retrying} · con error: ${body.failed}`,
  );
} catch (error) {
  console.error(`No se pudo llamar a ${url}. ¿Está corriendo la app?`, error);
  process.exit(1);
}
