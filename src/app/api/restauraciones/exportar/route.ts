import { NextResponse, type NextRequest } from "next/server";

import { can } from "@/domain/permissions";
import { parseRestorationFilters } from "@/domain/restoration-filters";
import { restorationsCsv } from "@/domain/restorations-csv";
import { searchParamsRecord } from "@/lib/search-params";
import { getAuthState } from "@/server/auth";
import { exportRestorations } from "@/server/restorations/queries";

/**
 * CSV del listado con los filtros de la URL (P33): todas las restauraciones que dan
 * (también las terminadas), sin paginar. Solo admin y ventas.
 */
export async function GET(request: NextRequest) {
  const state = await getAuthState();
  if (state.status !== "activo") {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }
  if (!can(state.user.role, "restauraciones.editar")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const filters = parseRestorationFilters(
    searchParamsRecord(request.nextUrl.searchParams),
  );
  const items = await exportRestorations(filters);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
  }).format(new Date());
  return new NextResponse(restorationsCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="restauraciones-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
