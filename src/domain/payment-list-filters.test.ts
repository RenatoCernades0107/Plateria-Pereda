import { describe, expect, it } from "vitest";

import {
  listPaymentsArgs,
  parsePaymentListFilters,
  paymentListHref,
} from "./payment-list-filters";

const BRANCH = "6F9619FF-8B86-D011-B42D-00C04FC964FF";

describe("filtros de la vista de pagos", () => {
  it("sin parámetros: todos los pagos, página 1", () => {
    expect(parsePaymentListFilters({})).toEqual({
      q: "",
      kind: [],
      methods: [],
      branchIds: [],
      from: null,
      to: null,
      page: 1,
    });
    expect(paymentListHref(parsePaymentListFilters({}))).toBe(
      "/restauraciones/pagos",
    );
  });

  it("lee los filtros, ignora los inválidos y los repite en la URL", () => {
    const filters = parsePaymentListFilters({
      q: "  RES-0001 ",
      tipo: ["reembolso", "otro"],
      metodo: ["Yape", " Yape ", ""],
      sucursal: [BRANCH, "no-es-uuid"],
      desde: "2026-10-01",
      hasta: "2026-02-30",
      pagina: "2",
    });
    expect(filters).toEqual({
      q: "RES-0001",
      kind: ["reembolso"],
      methods: ["Yape"],
      branchIds: [BRANCH.toLowerCase()],
      from: "2026-10-01",
      to: null,
      page: 2,
    });
    expect(paymentListHref(filters, { page: 1 })).toBe(
      `/restauraciones/pagos?q=RES-0001&tipo=reembolso&metodo=Yape&sucursal=${BRANCH.toLowerCase()}&desde=2026-10-01`,
    );
  });

  it("pagina en la BD; el CSV trae todo", () => {
    const filters = parsePaymentListFilters({ pagina: "3", tipo: "pago" });
    expect(listPaymentsArgs(filters)).toEqual({
      p_query: undefined,
      p_kind: ["pago"],
      p_methods: undefined,
      p_branch_ids: undefined,
      p_from: undefined,
      p_to: undefined,
      p_limit: 50,
      p_offset: 100,
    });
    expect(listPaymentsArgs(filters, { all: true })).toMatchObject({
      p_limit: 10000,
      p_offset: 0,
    });
  });
});
