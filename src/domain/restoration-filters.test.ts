import { describe, expect, it } from "vitest";

import {
  listRestorationsArgs,
  parseRestorationFilters,
  restorationFiltersHref,
  sortChange,
} from "./restoration-filters";

const UUID = "00000000-0000-0000-0000-0000000000AB";

describe("filtros del listado de restauraciones", () => {
  it("lee la URL con valores por defecto", () => {
    expect(parseRestorationFilters({})).toEqual({
      q: "",
      status: [],
      paymentStatus: [],
      paymentType: [],
      origin: [],
      clientId: null,
      workshopIds: [],
      from: null,
      to: null,
      sort: "created_at",
      dir: "desc",
      page: 1,
      view: "tabla",
    });
  });

  it("lee todos los filtros e ignora los inválidos", () => {
    expect(
      parseRestorationFilters({
        q: "  RES-0001 ",
        estado: "en_proceso",
        pago: "parcial",
        tipo: "a_cuenta",
        origen: "whatsapp",
        cliente: UUID,
        taller: "no-es-uuid",
        desde: "2026-09-01",
        hasta: "2026-02-30",
        orden: "total",
        dir: "asc",
        pagina: "3",
      }),
    ).toEqual({
      q: "RES-0001",
      status: ["en_proceso"],
      paymentStatus: ["parcial"],
      paymentType: ["a_cuenta"],
      origin: ["whatsapp"],
      clientId: UUID.toLowerCase(),
      workshopIds: [],
      from: "2026-09-01",
      to: null,
      sort: "total",
      dir: "asc",
      page: 3,
      view: "tabla",
    });
    const bad = parseRestorationFilters({
      estado: "x",
      orden: "precio",
      pagina: "-1",
    });
    expect([bad.status, bad.sort, bad.page]).toEqual([[], "created_at", 1]);
  });

  it("la URL ida y vuelta conserva los filtros y omite los valores por defecto", () => {
    const base = parseRestorationFilters({});
    expect(restorationFiltersHref(base)).toBe("/restauraciones");
    const href = restorationFiltersHref(base, {
      q: "Ana",
      status: ["lista"],
      paymentStatus: ["pendiente"],
      sort: "code",
      dir: "asc",
      page: 2,
      view: "tabla",
    });
    expect(href).toBe(
      "/restauraciones?q=Ana&estado=lista&pago=pendiente&orden=code&dir=asc&pagina=2",
    );
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(restorationFiltersHref(parseRestorationFilters(params))).toBe(href);
  });

  it("admite varios valores por filtro, sin repetir ni inválidos, y mantiene enlaces viejos", () => {
    const filters = parseRestorationFilters({
      estado: ["lista", "x", "aprobada", "lista"],
      taller: [UUID, "no-es-uuid", UUID.toLowerCase()],
      pago: "pagado",
    });
    expect(filters.status).toEqual(["aprobada", "lista"]);
    expect(filters.workshopIds).toEqual([UUID.toLowerCase()]);
    expect(filters.paymentStatus).toEqual(["pagado"]);
    const href = restorationFiltersHref(filters);
    expect(href).toBe(
      `/restauraciones?estado=aprobada&estado=lista&pago=pagado&taller=${UUID.toLowerCase()}`,
    );
    expect(
      parseRestorationFilters(
        Object.fromEntries(
          [...new URL(href, "http://x").searchParams.keys()].map((k) => [
            k,
            new URL(href, "http://x").searchParams.getAll(k),
          ]),
        ),
      ),
    ).toEqual(filters);
    expect(listRestorationsArgs(filters)).toMatchObject({
      p_status: ["aprobada", "lista"],
      p_payment_status: ["pagado"],
      p_workshop_ids: [UUID.toLowerCase()],
    });
  });

  it("ordenar por la misma columna invierte; por otra vuelve a la primera página", () => {
    const base = parseRestorationFilters({ pagina: "4" });
    expect(sortChange(base, "created_at")).toEqual({
      sort: "created_at",
      dir: "asc",
      page: 1,
    });
    expect(sortChange(base, "code")).toEqual({
      sort: "code",
      dir: "asc",
      page: 1,
    });
    expect(sortChange(base, "total")).toEqual({
      sort: "total",
      dir: "desc",
      page: 1,
    });
  });

  it("arma los argumentos de la consulta con paginación o para exportar", () => {
    const filters = parseRestorationFilters({
      q: "Ana",
      estado: "lista",
      pagina: "3",
    });
    expect(listRestorationsArgs(filters)).toEqual({
      p_query: "Ana",
      p_status: ["lista"],
      p_payment_status: undefined,
      p_payment_type: undefined,
      p_client_id: undefined,
      p_workshop_ids: undefined,
      p_from: undefined,
      p_to: undefined,
      p_sort: "created_at",
      p_dir: "desc",
      p_limit: 25,
      p_offset: 50,
    });
    expect(listRestorationsArgs(filters, { all: true })).toMatchObject({
      p_limit: 5000,
      p_offset: 0,
    });
  });

  it("en kanban trae todo en una página y lo guarda en la URL", () => {
    const filters = parseRestorationFilters({
      vista: "kanban",
      pagina: "3",
      q: "Ana",
    });
    expect(filters.view).toBe("kanban");
    expect(restorationFiltersHref(filters)).toBe(
      "/restauraciones?q=Ana&vista=kanban",
    );
    expect(listRestorationsArgs(filters)).toMatchObject({
      p_limit: 300,
      p_offset: 0,
    });
    expect(parseRestorationFilters({ vista: "otra" }).view).toBe("tabla");
  });
});
