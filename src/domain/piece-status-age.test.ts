import { describe, expect, it } from "vitest";

import { statusAgeText, statusAgeTone } from "./piece-status-age";

describe("días en el estado actual (C5)", () => {
  it("usa los umbrales del estado", () => {
    expect(statusAgeTone({ status: "en_espera" }, 2)).toBe("neutral");
    expect(statusAgeTone({ status: "en_espera" }, 3)).toBe("attention");
    expect(statusAgeTone({ status: "en_espera" }, 7)).toBe("critical");
    expect(statusAgeTone({ status: "aprobada" }, 7)).toBe("critical");
    expect(statusAgeTone({ status: "aprobada", inWorkshop: true }, 7)).toBe(
      "attention",
    );
    expect(statusAgeTone({ status: "aprobada", inWorkshop: true }, 15)).toBe(
      "critical",
    );
  });

  it("Lista para entregar tiene sus umbrales; los finales no alertan", () => {
    expect(
      statusAgeTone({ status: "aprobada", readyForDelivery: true }, 14),
    ).toBe("attention");
    expect(statusAgeTone({ status: "entregada" }, 100)).toBe("neutral");
    expect(statusAgeTone({ status: "anulada" }, 100)).toBe("neutral");
  });

  it("texto en días", () => {
    expect(statusAgeText(0)).toBe("Hoy en este estado");
    expect(statusAgeText(1)).toBe("1 día en este estado");
    expect(statusAgeText(5)).toBe("5 días en este estado");
  });
});
