import { describe, expect, it } from "vitest";

import { pieceFilterChips, restorationFilterChips } from "./filter-presets";
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
      "Por devolver",
      "En taller 7+ días",
    ]);
    expect(chips.every((c) => !c.active)).toBe(true);
    expect(chips[0]!.href).toBe("/piezas?q=fuente&urgentes=1");
    expect(chips[3]!.href).toBe("/piezas?q=fuente&dias=7");
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
    ).toEqual(["parcialmente-aprobadas", "listas", "whatsapp"]);
  });
});
