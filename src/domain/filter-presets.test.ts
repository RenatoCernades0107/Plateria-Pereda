import { describe, expect, it } from "vitest";

import {
  pieceChipCountFilters,
  pieceFilterChips,
  restorationChipCountFilters,
  restorationFilterChips,
} from "./filter-presets";
import { parsePieceBoardFilters } from "./piece-board-filters";
import { parseRestorationFilters } from "./restoration-filters";

describe("filtros de un clic (K12)", () => {
  it("piezas: cada chip agrega su filtro a la URL y vuelve a la página 1", () => {
    const chips = pieceFilterChips(
      parsePieceBoardFilters({ q: "fuente", pagina: "3" }),
    );
    expect(chips.map((c) => c.label)).toEqual([
      "Urgentes",
      "Listas para entregar",
      "En taller 7+ días",
    ]);
    expect(chips.every((c) => !c.active)).toBe(true);
    expect(chips[0]!.href).toBe("/piezas?q=fuente&urgentes=1");
    expect(chips[2]!.href).toBe("/piezas?q=fuente&dias=7");
  });

  it("piezas: un chip activo se quita con otro clic", () => {
    const chips = pieceFilterChips(
      parsePieceBoardFilters({ urgentes: "1", listas: "1" }),
    );
    expect(chips[0]).toMatchObject({ active: true, href: "/piezas?listas=1" });
    expect(chips[1]).toMatchObject({
      active: true,
      href: "/piezas?urgentes=1",
    });
  });

  it("restauraciones: chips de pago solo para quien ve los montos", () => {
    const filters = parseRestorationFilters({ pago: "pendiente" });
    const all = restorationFilterChips(filters, { showMoney: true });
    expect(all[0]).toMatchObject({
      label: "Pago pendiente",
      active: true,
      href: "/restauraciones",
    });
    expect(all[1]!.href).toBe("/restauraciones?pago=parcial");
    const listas = all.find((c) => c.key === "listas")!;
    expect(listas.href).toBe(
      "/restauraciones?estado=parcialmente_lista&estado=lista&pago=pendiente",
    );
    expect(
      restorationFilterChips(filters, { showMoney: false }).map((c) => c.key),
    ).toEqual([
      "parcialmente-aprobadas",
      "esperando-cliente",
      "listas",
      "whatsapp",
    ]);
  });

  it("restauraciones: «Esperando cliente» filtra las que tienen piezas en espera", () => {
    const chip = (f: ReturnType<typeof parseRestorationFilters>) =>
      restorationFilterChips(f, { showMoney: false }).find(
        (c) => c.key === "esperando-cliente",
      )!;
    const off = chip(parseRestorationFilters({ vista: "kanban" }));
    expect(off).toMatchObject({
      active: false,
      tone: "waiting",
      href: "/restauraciones?espera=1&vista=kanban",
    });
    const on = chip(parseRestorationFilters({ espera: "1", vista: "kanban" }));
    expect(on).toMatchObject({
      active: true,
      href: "/restauraciones?vista=kanban",
    });
  });

  it("los chips que piden atención van en tono de alerta y muestran su contador", () => {
    const chips = pieceFilterChips(parsePieceBoardFilters({}), {
      urgentes: 3,
      listas: 5,
    });
    expect(chips.map((c) => [c.key, c.tone, c.count])).toEqual([
      ["urgentes", "alert", 3],
      ["listas", "success", 5],
      ["taller", "alert", undefined],
    ]);
  });

  it("cada chip se cuenta con los filtros actuales y el chip encendido", () => {
    const filters = parsePieceBoardFilters({ q: "fuente", pagina: "2" });
    const sets = pieceChipCountFilters({ ...filters, urgent: true });
    expect(sets[0]).toMatchObject({ key: "urgentes", active: true });
    expect(sets[1]).toMatchObject({
      key: "listas",
      active: false,
      filters: { q: "fuente", urgent: true, ready: true, page: 1 },
    });
    expect(sets[2]!.filters.minDays).toBe(7);
    expect(
      restorationChipCountFilters(parseRestorationFilters({}), {
        showMoney: false,
      }).map((c) => c.key),
    ).toEqual([
      "parcialmente-aprobadas",
      "esperando-cliente",
      "listas",
      "whatsapp",
    ]);
  });
});
