import { describe, expect, it } from "vitest";

import scenarios from "../../tests/fixtures/restorations/derivations.json";

import { PIECE_STATUSES, type PieceStatus } from "./piece-state-machine";
import {
  advanceRestorationStatus,
  deriveLocation,
  deriveRestorationStatus,
  isReadyForShopifyOrder,
  missingSalePrices,
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
    priceCents: p.price === null ? null : Math.round(p.price * 100),
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

  it("espera el precio de venta de cada pieza que se cobra (D58)", () => {
    const approvedAt = new Date("2026-10-01T15:00:00Z");
    expect(
      isReadyForShopifyOrder([
        { status: "aprobada", approvedAt, priceCents: 0 },
        { status: "aprobada", approvedAt, priceCents: null },
      ]),
    ).toBe(false);
    expect(
      isReadyForShopifyOrder([
        { status: "aprobada", approvedAt, priceCents: 0 },
        { status: "rechazada", approvedAt: null, priceCents: null },
      ]),
    ).toBe(true);
  });
});

describe("missingSalePrices (D58)", () => {
  const piece = (
    code: string,
    status: PieceStatus,
    priceCents: number | null,
  ) => ({ code, status, priceCents });

  it("sin orden avisa cuando todo está aprobado y falta algún precio", () => {
    expect(
      missingSalePrices(
        [
          piece("RES-00001-1", "aprobada", 1000),
          piece("RES-00001-2", "enviada_taller", null),
          piece("RES-00001-3", "anulada", null),
        ],
        false,
      ),
    ).toEqual({
      codes: ["RES-00001-2"],
      message:
        "Faltan precios de venta para crear la orden de Shopify: RES-00001-2.",
    });
  });

  it("sin orden no avisa mientras haya piezas por aprobar o si no falta nada", () => {
    expect(
      missingSalePrices(
        [
          piece("RES-00001-1", "aprobada", null),
          piece("RES-00001-2", "en_consulta", null),
        ],
        false,
      ),
    ).toBeNull();
    expect(
      missingSalePrices([piece("RES-00001-1", "aprobada", 0)], false),
    ).toBeNull();
  });

  it("con la orden avisa las piezas aprobadas sin precio", () => {
    expect(
      missingSalePrices(
        [
          piece("RES-00001-1", "aprobada", 1000),
          piece("RES-00001-2", "aprobada", null),
          piece("RES-00001-3", "registrada", null),
        ],
        true,
      )?.message,
    ).toBe(
      "Faltan precios de venta para agregar a la orden de Shopify: RES-00001-2.",
    );
  });
});

describe("deriveLocation (escenarios compartidos con la BD)", () => {
  it.each(scenarios.location)(
    "$status (llegada: $arrivedAt, vuelta: $lastReturnedAt, devuelta: $returnedAt) → $expected",
    ({
      status,
      arrivedAt,
      firstSentAt,
      lastSentAt,
      lastReturnedAt,
      returnedAt,
      expected,
    }) => {
      expect(
        deriveLocation({
          status: status as PieceStatus,
          arrivedAt: date(arrivedAt),
          firstSentAt: date(firstSentAt),
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
