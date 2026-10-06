import { describe, expect, it } from "vitest";

import scenarios from "../../tests/fixtures/restorations/derivations.json";

import { PIECE_STATUSES, type PieceStatus } from "./piece-state-machine";
import {
  advanceRestorationStatus,
  deriveLocation,
  deriveRestorationStatus,
  isReadyForShopifyOrder,
  PIECE_LOCATION_LABELS,
  PIECE_LOCATIONS,
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
} from "./restoration-status";

const date = (value: string | null) => (value ? new Date(value) : null);

const restorationCases = scenarios.restorationStatus.map((s) => ({
  ...s,
  pieces: s.pieces.map((p) => ({
    status: p.status as PieceStatus,
    approvedAt: date(p.approvedAt),
    firstSentAt: date(p.firstSentAt),
    readyForDelivery: p.readyForDelivery,
  })),
}));

describe("deriveRestorationStatus (escenarios compartidos con la BD)", () => {
  it.each(restorationCases)("$name → $expected", ({ pieces, expected }) => {
    expect(deriveRestorationStatus(pieces)).toBe(expected);
  });

  it("los escenarios usan estados válidos y cubren todos los estados generales", () => {
    for (const s of restorationCases) {
      for (const p of s.pieces) expect(PIECE_STATUSES).toContain(p.status);
    }
    expect(new Set(restorationCases.map((s) => s.expected))).toEqual(
      new Set(RESTORATION_STATUSES),
    );
  });

  it("sin piezas queda Registrada", () => {
    expect(deriveRestorationStatus([])).toBe("registrada");
  });

  it("el orden de las piezas no importa", () => {
    for (const { pieces, expected } of restorationCases) {
      expect(deriveRestorationStatus([...pieces].reverse())).toBe(expected);
    }
  });
});

describe("isReadyForShopifyOrder (escenarios compartidos con la BD)", () => {
  it.each(restorationCases)(
    "$name → $readyForOrder",
    ({ pieces, readyForOrder }) => {
      expect(isReadyForShopifyOrder(pieces)).toBe(readyForOrder);
    },
  );

  it("sin piezas no hay orden", () => {
    expect(isReadyForShopifyOrder([])).toBe(false);
  });
});

describe("deriveLocation (escenarios compartidos con la BD)", () => {
  it.each(scenarios.location)(
    "$status (llegada: $arrivedAt, vuelta: $lastReturnedAt, devuelta: $returnedAt) → $expected",
    ({
      status,
      arrivedAt,
      lastSentAt,
      lastReturnedAt,
      returnedAt,
      expected,
    }) => {
      expect(
        deriveLocation({
          status: status as PieceStatus,
          arrivedAt: date(arrivedAt),
          lastSentAt: date(lastSentAt),
          lastReturnedAt: date(lastReturnedAt),
          returnedAt: date(returnedAt),
        }),
      ).toBe(expected);
    },
  );

  it("los escenarios cubren todos los estados y ubicaciones", () => {
    expect(new Set(scenarios.location.map((s) => s.status))).toEqual(
      new Set(PIECE_STATUSES),
    );
    expect(new Set(scenarios.location.map((s) => s.expected))).toEqual(
      new Set(PIECE_LOCATIONS),
    );
  });
});

describe("etiquetas", () => {
  it("todos los estados generales y ubicaciones tienen etiqueta", () => {
    expect(Object.keys(RESTORATION_STATUS_LABELS).sort()).toEqual(
      [...RESTORATION_STATUSES].sort(),
    );
    expect(Object.keys(PIECE_LOCATION_LABELS).sort()).toEqual(
      [...PIECE_LOCATIONS].sort(),
    );
  });
});

describe("advanceRestorationStatus (P19: solo avanza)", () => {
  it("avanza cuando lo calculado es posterior", () => {
    expect(advanceRestorationStatus("aprobada", "en_proceso")).toBe(
      "en_proceso",
    );
    expect(advanceRestorationStatus("lista", "completada")).toBe("completada");
  });

  it("no retrocede si una pieza lista se observa y vuelve al taller", () => {
    expect(advanceRestorationStatus("lista", "en_proceso")).toBe("lista");
    expect(advanceRestorationStatus("completada", "parcialmente_lista")).toBe(
      "completada",
    );
    // Una pieza nueva en una restauración aprobada no la devuelve a Registrada.
    expect(advanceRestorationStatus("aprobada", "registrada")).toBe("aprobada");
  });

  it("si se anulan todas las piezas queda Anulada, y Anulada es final", () => {
    expect(advanceRestorationStatus("en_proceso", "anulada")).toBe("anulada");
    expect(advanceRestorationStatus("anulada", "registrada")).toBe("anulada");
  });
});
