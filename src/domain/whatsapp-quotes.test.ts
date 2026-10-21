import { describe, expect, it } from "vitest";

import {
  canCopyQuote,
  canDiscardQuote,
  canEditQuote,
  deriveWhatsappQuoteStatus,
  listWhatsappQuotesArgs,
  parseWhatsappQuoteFilters,
  quoteAge,
  WHATSAPP_QUOTE_STATUS_LABELS,
  WHATSAPP_QUOTE_STATUSES,
  whatsappQuoteFiltersHref,
  whatsappQuoteSortChange,
  whatsappQuoteStatusChips,
} from "./whatsapp-quotes";

describe("estado de la cotización de WhatsApp (P46)", () => {
  it.each([
    [3, 0, "cotizada"],
    [3, 1, "pedida_parcial"],
    [3, 2, "pedida_parcial"],
    [3, 3, "pedida"],
    [1, 1, "pedida"],
  ] as const)("%i piezas, %i pedidas → %s", (items, ordered, expected) => {
    expect(deriveWhatsappQuoteStatus(items, ordered)).toBe(expected);
  });

  it("todos los estados tienen etiqueta", () => {
    expect(Object.keys(WHATSAPP_QUOTE_STATUS_LABELS).sort()).toEqual(
      [...WHATSAPP_QUOTE_STATUSES].sort(),
    );
    expect(WHATSAPP_QUOTE_STATUS_LABELS.pedida_parcial).toBe("Pedida en parte");
  });

  it("se edita solo hasta la primera copia y si no está descartada", () => {
    expect(canEditQuote({ status: "cotizada", everCopied: false })).toBe(true);
    expect(canEditQuote({ status: "cotizada", everCopied: true })).toBe(false);
    expect(canEditQuote({ status: "descartada", everCopied: false })).toBe(
      false,
    );
  });

  it("se copia mientras queden piezas pendientes y no esté descartada", () => {
    expect(canCopyQuote({ status: "pedida_parcial", pendingCount: 1 })).toBe(
      true,
    );
    expect(canCopyQuote({ status: "pedida", pendingCount: 0 })).toBe(false);
    expect(canCopyQuote({ status: "descartada", pendingCount: 2 })).toBe(false);
  });

  it("una cotización pedida completa ya no se descarta", () => {
    expect(canDiscardQuote("cotizada")).toBe(true);
    expect(canDiscardQuote("pedida_parcial")).toBe(true);
    expect(canDiscardQuote("pedida")).toBe(false);
    expect(canDiscardQuote("descartada")).toBe(false);
  });
});

describe("quoteAge", () => {
  const now = new Date("2026-10-06T15:00:00Z");
  it.each([
    ["2026-10-06T14:00:00Z", "hoy"],
    ["2026-10-05T15:00:00Z", "ayer"],
    ["2026-10-01T15:00:00Z", "hace 5 días"],
    ["2026-09-01T15:00:00Z", "hace 1 mes"],
    ["2026-06-01T15:00:00Z", "hace 4 meses"],
    ["2025-09-01T15:00:00Z", "hace 1 año"],
    ["2023-09-01T15:00:00Z", "hace 3 años"],
  ])("%s → %s", (created, expected) => {
    expect(quoteAge(new Date(created), now)).toBe(expected);
  });
});

describe("filtros del listado", () => {
  it("lee la URL e ignora valores inválidos", () => {
    expect(parseWhatsappQuoteFilters({})).toEqual({
      q: "",
      status: null,
      clientId: null,
      from: null,
      to: null,
      sort: "created_at",
      dir: "desc",
      page: 1,
    });
    expect(
      parseWhatsappQuoteFilters({
        q: " fuente ",
        estado: "pedida_parcial",
        cliente: "00000000-0000-0000-0000-0000000000AB",
        desde: "2026-10-01",
        hasta: "2026-02-30",
        pagina: "2",
      }),
    ).toEqual({
      q: "fuente",
      status: "pedida_parcial",
      clientId: "00000000-0000-0000-0000-0000000000ab",
      from: "2026-10-01",
      to: null,
      sort: "created_at",
      dir: "desc",
      page: 2,
    });
    expect(parseWhatsappQuoteFilters({ estado: "x" }).status).toBeNull();
  });

  it("arma la URL y los argumentos de la consulta", () => {
    const filters = parseWhatsappQuoteFilters({
      q: "jarra",
      estado: "cotizada",
      pagina: "3",
    });
    expect(whatsappQuoteFiltersHref(filters)).toBe(
      "/cotizaciones-whatsapp?q=jarra&estado=cotizada&pagina=3",
    );
    expect(whatsappQuoteFiltersHref(parseWhatsappQuoteFilters({}))).toBe(
      "/cotizaciones-whatsapp",
    );
    expect(listWhatsappQuotesArgs(filters)).toEqual({
      p_query: "jarra",
      p_status: "cotizada",
      p_client_id: undefined,
      p_from: undefined,
      p_to: undefined,
      p_limit: 25,
      p_offset: 50,
      p_sort: "created_at",
      p_dir: "desc",
    });
  });

  it("ordena como las restauraciones: la misma columna invierte", () => {
    const filters = parseWhatsappQuoteFilters({ orden: "total", dir: "asc" });
    expect(filters).toMatchObject({ sort: "total", dir: "asc" });
    expect(whatsappQuoteFiltersHref(filters)).toBe(
      "/cotizaciones-whatsapp?orden=total&dir=asc",
    );
    expect(whatsappQuoteSortChange(filters, "total")).toEqual({
      sort: "total",
      dir: "desc",
      page: 1,
    });
    expect(whatsappQuoteSortChange(filters, "client")).toEqual({
      sort: "client",
      dir: "asc",
      page: 1,
    });
    expect(parseWhatsappQuoteFilters({ orden: "x" }).sort).toBe("created_at");
  });

  it("chips por estado: activan el filtro y, activos, lo quitan", () => {
    const chips = whatsappQuoteStatusChips(
      parseWhatsappQuoteFilters({ estado: "cotizada", pagina: "2" }),
      { pedida: 4 },
    );
    expect(chips.map((c) => c.key)).toEqual([
      "cotizada",
      "pedida_parcial",
      "pedida",
      "descartada",
    ]);
    expect(chips[0]).toMatchObject({
      active: true,
      href: "/cotizaciones-whatsapp",
    });
    expect(chips[2]).toMatchObject({
      active: false,
      count: 4,
      href: "/cotizaciones-whatsapp?estado=pedida",
    });
  });
});
