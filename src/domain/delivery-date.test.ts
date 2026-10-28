import { describe, expect, it } from "vitest";

import {
  formatDeliveryDate,
  isDeliveryOverdue,
  isIsoDate,
  todayInLima,
} from "./delivery-date";

// 2026-10-27 22:00 en Lima (UTC-5) ya es 28 en UTC.
const NOW = new Date("2026-10-28T03:00:00Z");

describe("todayInLima", () => {
  it("usa la fecha de Lima, no la UTC", () => {
    expect(todayInLima(NOW)).toBe("2026-10-27");
  });
});

describe("isIsoDate", () => {
  it("acepta fechas que existen", () => {
    expect(isIsoDate("2026-10-27")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rechaza lo que no es AAAA-MM-DD o no existe en el calendario", () => {
    for (const value of [
      "",
      "2026-02-30",
      "2027-02-29",
      "27/10/2026",
      "2026-1-5",
    ])
      expect(isIsoDate(value)).toBe(false);
  });
});

describe("formatDeliveryDate", () => {
  it("escribe día y mes sin correr el día por la zona horaria", () => {
    expect(formatDeliveryDate("2026-10-30", NOW)).toBe("30 oct");
    expect(formatDeliveryDate("2026-01-05", NOW)).toBe("5 ene");
  });

  it("agrega el año si no es el actual", () => {
    expect(formatDeliveryDate("2027-01-05", NOW)).toBe("5 ene 2027");
  });

  it("deja tal cual lo que no es una fecha", () => {
    expect(formatDeliveryDate("pronto", NOW)).toBe("pronto");
  });
});

describe("isDeliveryOverdue", () => {
  it("vence cuando la fecha es anterior a hoy en Lima", () => {
    expect(isDeliveryOverdue("2026-10-26", NOW)).toBe(true);
    expect(isDeliveryOverdue("2026-10-27", NOW)).toBe(false);
    expect(isDeliveryOverdue("2026-10-28", NOW)).toBe(false);
  });
});
