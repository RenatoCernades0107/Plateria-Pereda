import { describe, expect, it } from "vitest";

import { dashboardScopes, rangeEndsToday, scopeText } from "./dashboard-scope";

const TODAY = "2026-11-24";

describe("dashboardScopes", () => {
  it("liga los tres alcances al rango y al día de hoy", () => {
    const scopes = dashboardScopes(
      { from: "2026-11-01", to: "2026-11-24" },
      TODAY,
    );
    expect(scopes.periodo).toEqual({
      kind: "periodo",
      range: { from: "2026-11-01", to: "2026-11-24" },
      today: TODAY,
    });
    expect(scopes.cohorte.kind).toBe("cohorte");
    expect(scopes.hoy).toEqual({ kind: "hoy", today: TODAY });
  });

  it("no arrastra campos extra del rango (p. ej. el atajo)", () => {
    const scopes = dashboardScopes(
      { from: "2026-11-01", to: "2026-11-24", preset: "mes" } as {
        from: string;
        to: string;
      },
      TODAY,
    );
    expect(scopes.periodo.range).toEqual({
      from: "2026-11-01",
      to: "2026-11-24",
    });
  });
});

describe("rangeEndsToday", () => {
  it("es verdadero solo si el rango termina hoy", () => {
    expect(rangeEndsToday({ from: "2026-11-01", to: TODAY }, TODAY)).toBe(true);
    expect(
      rangeEndsToday({ from: "2026-10-01", to: "2026-10-31" }, TODAY),
    ).toBe(false);
  });
});

describe("scopeText", () => {
  it("periodo que llega a hoy: el rango y «hasta hoy»", () => {
    const text = scopeText(
      dashboardScopes({ from: "2026-11-01", to: TODAY }, TODAY).periodo,
    );
    expect(text.label).toBe("1 nov – 24 nov 2026");
    expect(text.detail).toBe("hasta hoy");
    expect(text.description).toContain("hasta hoy");
  });

  it("periodo ya cerrado: solo el rango, sin «hasta hoy»", () => {
    const text = scopeText(
      dashboardScopes({ from: "2026-10-01", to: "2026-10-31" }, TODAY).periodo,
    );
    expect(text.label).toBe("1 oct – 31 oct 2026");
    expect(text.detail).toBeUndefined();
    expect(text.description).not.toContain("hasta hoy");
  });

  it("un solo día que es hoy: la fecha y «hoy»", () => {
    const text = scopeText(
      dashboardScopes({ from: TODAY, to: TODAY }, TODAY).periodo,
    );
    expect(text.label).toBe("24 nov 2026");
    expect(text.detail).toBe("hoy");
  });

  it("cohorte: el rango y «estado actual»", () => {
    const text = scopeText(
      dashboardScopes({ from: "2026-10-01", to: "2026-10-31" }, TODAY).cohorte,
    );
    expect(text.label).toBe("1 oct – 31 oct 2026");
    expect(text.detail).toBe("estado actual");
    expect(text.description).toMatch(/con el estado que tiene hoy/);
  });

  it("hoy: «Al día de hoy», sin depender del rango", () => {
    const text = scopeText(
      dashboardScopes({ from: "2026-01-01", to: "2026-01-31" }, TODAY).hoy,
    );
    expect(text.label).toBe("Al día de hoy");
    expect(text.detail).toBe("no cambia con el periodo");
    expect(text.description).toContain("24 nov 2026");
  });
});
