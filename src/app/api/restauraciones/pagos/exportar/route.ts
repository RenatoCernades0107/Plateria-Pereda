import { NextResponse, type NextRequest } from "next/server";

import { can } from "@/domain/permissions";
import { parsePaymentListFilters } from "@/domain/payment-list-filters";
import { paymentsCsv } from "@/domain/payments-csv";
import { searchParamsRecord } from "@/lib/search-params";
import { getAuthState } from "@/server/auth";
import { listAllPayments } from "@/server/payments/queries";

/** CSV de los pagos con los filtros de la URL, sin paginar. Solo admin y ventas. */
export async function GET(request: NextRequest) {
  const state = await getAuthState();
  if (state.status !== "activo") {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }
  if (!can(state.user.role, "restauraciones.editar")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const filters = parsePaymentListFilters(
    searchParamsRecord(request.nextUrl.searchParams),
  );
  const { items } = await listAllPayments(filters, { all: true });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
  }).format(new Date());
  return new NextResponse(paymentsCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pagos-restauraciones-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
