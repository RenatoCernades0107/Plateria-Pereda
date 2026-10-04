import { describe, expect, it } from "vitest";

import scenarios from "../../tests/fixtures/restorations/derivations.json";

import { PIECE_STATUSES, type PieceStatus } from "./piece-state-machine";
import {
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
    "$status (llegada: $arrivedAt) → $expected",
    ({ status, arrivedAt, expected }) => {
      expect(
        deriveLocation({
          status: status as PieceStatus,
          arrivedAt: date(arrivedAt),
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
