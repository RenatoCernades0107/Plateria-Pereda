import { NextResponse, type NextRequest } from "next/server";

import { can } from "@/domain/permissions";
import { parsePieceBoardFilters } from "@/domain/piece-board-filters";
import { piecesCsv } from "@/domain/pieces-csv";
import { searchParamsRecord } from "@/lib/search-params";
import { getAuthState } from "@/server/auth";
import { exportPieces } from "@/server/restorations/queries";

/**
 * CSV de la vista de piezas con los filtros de la URL: todas las que dan (también las
 * terminadas), sin paginar. Quien puede ver piezas lo exporta; la BD ya oculta costo
 * y precio según el rol y aquí tampoco se muestran sus columnas.
 */
export async function GET(request: NextRequest) {
  const state = await getAuthState();
  if (state.status !== "activo") {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }
  const role = state.user.role;
  if (!can(role, "restauraciones.ver")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const showClient = can(role, "clientes.ver");
  const filters = parsePieceBoardFilters(
    searchParamsRecord(request.nextUrl.searchParams),
  );
  const items = await exportPieces(filters, { withClient: showClient });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
  }).format(new Date());
  const csv = piecesCsv(
    items.map((p) => ({
      restorationCode: p.restorationCode,
      code: p.code,
      clientName: p.clientName,
      description: p.description,
      quantity: p.quantity,
      serviceName: p.serviceName,
      materialName: p.materialName,
      measure: p.measure,
      weightGrams: p.weightGrams,
      status: p.status,
      location: p.location,
      urgent: p.urgent,
      workshopName: p.workshopName,
      workshopDays: p.workshopDays,
      estimatedDeliveryDate: p.estimatedDeliveryDate,
      workshopDeliveryDate: p.workshopDeliveryDate,
      registeredAt: p.registeredAt ?? null,
      finishedAt: p.finishedAt ?? null,
      serviceCostCents: p.serviceCostCents,
      priceCents: p.priceCents,
    })),
    {
      showClient,
      showCost: can(role, "piezas.costo-servicio"),
      showPrice: can(role, "piezas.precio-venta.ver"),
    },
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="piezas-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
