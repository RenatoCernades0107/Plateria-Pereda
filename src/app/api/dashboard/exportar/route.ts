import { NextResponse, type NextRequest } from "next/server";

import {
  clientsCsv,
  dashboardCsvFilename,
  ordersCsv,
  quotesCsv,
  salesCsv,
  sellersCsv,
  summaryCsv,
  workshopsCsv,
} from "@/domain/dashboard-csv";
import {
  formatRange,
  parseDashboardParams,
  previousRange,
} from "@/domain/dashboard-range";
import { can } from "@/domain/permissions";
import { getAuthState } from "@/server/auth";
import {
  dashboardClients,
  dashboardOrders,
  dashboardQuotes,
  dashboardSales,
  dashboardSellers,
  dashboardSummaryWithPrevious,
  dashboardWorkshops,
} from "@/server/dashboard-metrics";

/**
 * CSV de una pestaña del dashboard con el rango de la URL. Solo admin y ventas; los
 * costos y los demás vendedores los filtra la BD según el rol, igual que en pantalla.
 */
export async function GET(request: NextRequest) {
  const state = await getAuthState();
  if (state.status !== "activo") {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }
  if (!can(state.user.role, "dashboard.ver")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { area, range } = parseDashboardParams(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const period = formatRange(range);

  let csv: string;
  switch (area) {
    case "resumen": {
      const { current, previous } = await dashboardSummaryWithPrevious(range);
      csv = summaryCsv(
        current,
        previous,
        `${period} (anterior: ${formatRange(previousRange(range))})`,
      );
      break;
    }
    case "ventas":
      csv = salesCsv(await dashboardSales(range), period);
      break;
    case "pedidos":
      csv = ordersCsv(await dashboardOrders(range), period);
      break;
    case "clientes":
      csv = clientsCsv(await dashboardClients(range), period);
      break;
    case "talleres":
      csv = workshopsCsv(await dashboardWorkshops(range), period);
      break;
    case "vendedores":
      csv = sellersCsv(await dashboardSellers(range), period);
      break;
    case "cotizaciones":
      csv = quotesCsv(await dashboardQuotes(range), period);
      break;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dashboardCsvFilename(area, range)}"`,
      "Cache-Control": "no-store",
    },
  });
}
