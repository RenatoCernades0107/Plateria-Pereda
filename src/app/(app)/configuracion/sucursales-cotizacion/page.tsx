import type { Metadata } from "next";

import { QuoteIssuersManager } from "@/components/quote-issuers/quote-issuers-manager";
import { QUOTE_ISSUERS_TITLE } from "@/domain/quote-issuers";
import { requirePermission } from "@/server/auth";
import { listQuoteIssuers } from "@/server/quotes/queries";

export const metadata: Metadata = { title: QUOTE_ISSUERS_TITLE };

export default async function SucursalesCotizacionPage() {
  await requirePermission("configuracion.gestionar");
  return <QuoteIssuersManager issuers={await listQuoteIssuers()} />;
}
