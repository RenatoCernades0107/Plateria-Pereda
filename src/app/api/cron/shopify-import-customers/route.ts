import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { importCustomerWithAdmin } from "@/server/clients/repository";
import { importShopifyCustomers } from "@/server/clients/shopify-import";
import { safeEqual } from "@/server/secrets";
import { getShopifyGateway } from "@/server/shopify";

/**
 * Importación de los clientes de Shopify (Paso 6.6). No es un cron: se ejecuta a mano
 * con `pnpm shopify:import-customers`, con `Authorization: Bearer CRON_SECRET`. Si el
 * tiempo no alcanza devuelve `nextCursor` y el script vuelve a llamar desde ahí.
 */
export const maxDuration = 300;

/** Margen para responder antes de que la plataforma corte la función. */
const BUDGET_MS = 240_000;

export async function POST(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const after = request.nextUrl.searchParams.get("after");
  try {
    const summary = await importShopifyCustomers({
      gateway: getShopifyGateway(),
      importCustomer: importCustomerWithAdmin,
      after,
      deadline: Date.now() + BUDGET_MS,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("No se pudo importar los clientes de Shopify", error);
    return NextResponse.json(
      { error: "Shopify no respondió. Vuelve a intentarlo.", after },
      { status: 502 },
    );
  }
}
