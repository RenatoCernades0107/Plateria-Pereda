import { describe, expect, it } from "vitest";

import scenarios from "../../tests/fixtures/restorations/derivations.json";

import { PIECE_STATUSES, type PieceStatus } from "./piece-state-machine";
import {
  advanceRestorationStatus,
  formatObservedProgress,
  formatPartialProgress,
  observedProgress,
  partialProgress,
  deriveLocation,
  deriveRestorationStatus,
  isReadyForShopifyOrder,
  missingSalePrices,
  PIECE_LOCATION_LABELS,
  PIECE_LOCATIONS,
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
  toRestorationStatus,
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
      reviewSentAt,
      reviewReturnedAt,
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
          reviewSentAt: date(reviewSentAt),
          reviewReturnedAt: date(reviewReturnedAt),
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

describe("toRestorationStatus (P56)", () => {
  it("el valor retirado En proceso se muestra como Aprobada", () => {
    expect(RESTORATION_STATUSES).not.toContain("en_proceso");
    expect(toRestorationStatus("en_proceso")).toBe("aprobada");
    expect(toRestorationStatus("lista")).toBe("lista");
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
    expect(advanceRestorationStatus("aprobada", "parcialmente_lista")).toBe(
      "parcialmente_lista",
    );
    expect(advanceRestorationStatus("lista", "completada")).toBe("completada");
    expect(
      advanceRestorationStatus("registrada", "parcialmente_aprobada"),
    ).toBe("parcialmente_aprobada");
    expect(advanceRestorationStatus("parcialmente_aprobada", "aprobada")).toBe(
      "aprobada",
    );
  });

  it("una pieza nueva en una restauración aprobada no la regresa a Parcialmente aprobada", () => {
    expect(advanceRestorationStatus("aprobada", "parcialmente_aprobada")).toBe(
      "aprobada",
    );
  });

  it("no retrocede si una pieza lista se observa y vuelve al taller", () => {
    expect(advanceRestorationStatus("lista", "aprobada")).toBe("lista");
    expect(advanceRestorationStatus("completada", "parcialmente_lista")).toBe(
      "completada",
    );
    // Una pieza nueva en una restauración aprobada no la devuelve a Registrada.
    expect(advanceRestorationStatus("aprobada", "registrada")).toBe("aprobada");
  });

  it("si se anulan todas las piezas queda Anulada, y Anulada es final", () => {
    expect(advanceRestorationStatus("aprobada", "anulada")).toBe("anulada");
    expect(advanceRestorationStatus("anulada", "registrada")).toBe("anulada");
  });
});

describe("partialProgress", () => {
  const p = (
    status: PieceStatus,
    approved: boolean,
    readyForDelivery = false,
  ) => ({
    status,
    approvedAt: approved ? new Date() : null,
    firstSentAt: null,
    readyForDelivery,
  });

  it("cuenta las aprobadas sin las piezas cerradas", () => {
    const progress = partialProgress("parcialmente_aprobada", [
      p("aprobada", true),
      p("aprobada", true),
      p("registrada", false),
      p("anulada", false),
    ]);
    expect(progress).toEqual({ done: 2, total: 3, label: "aprobadas" });
    expect(formatPartialProgress(progress!)).toBe("2/3 aprobadas");
  });

  it("cuenta las listas (de vuelta o entregadas)", () => {
    expect(
      partialProgress("parcialmente_lista", [
        p("enviada_taller", true, true),
        p("entregada", true),
        p("enviada_taller", true),
      ]),
    ).toEqual({ done: 2, total: 3, label: "listas" });
  });

  it("no aplica a los demás estados", () => {
    expect(partialProgress("aprobada", [p("aprobada", true)])).toBeNull();
  });
});

describe("observedProgress", () => {
  const p = (status: PieceStatus) => ({ status });

  it("cuenta las piezas observadas sobre las piezas vivas", () => {
    const progress = observedProgress([
      p("observada"),
      p("observada"),
      p("enviada_taller"),
      p("aprobada"),
      p("anulada"),
      p("rechazada"),
      p("sin_arreglo"),
    ]);
    expect(progress).toEqual({ observed: 2, total: 4 });
    expect(formatObservedProgress(progress!)).toBe("2 de 4 piezas observadas");
  });

  it("sin piezas observadas no hay nada que mostrar", () => {
    expect(observedProgress([p("aprobada"), p("entregada")])).toBeNull();
    expect(observedProgress([p("anulada")])).toBeNull();
    expect(observedProgress([])).toBeNull();
  });

  it("una observada que luego se anula ya no cuenta", () => {
    expect(observedProgress([p("anulada"), p("aprobada")])).toBeNull();
  });

  it("con una sola pieza viva va en singular", () => {
    expect(formatObservedProgress({ observed: 1, total: 1 })).toBe(
      "1 de 1 pieza observada",
    );
    expect(formatObservedProgress({ observed: 1, total: 3 })).toBe(
      "1 de 3 piezas observadas",
    );
  });
});
