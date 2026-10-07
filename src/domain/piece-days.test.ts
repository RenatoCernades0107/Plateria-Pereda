import { describe, expect, it } from "vitest";

import scenarios from "../../tests/fixtures/restorations/derivations.json";

import {
  calendarDaysBetween,
  daysInWorkshop,
  fulfillmentDays,
} from "./piece-days";
import type { PieceEvent, PieceStatus } from "./piece-state-machine";

describe("daysInWorkshop (escenarios compartidos con la BD)", () => {
  it.each(scenarios.daysInWorkshop)("$name", ({ history, now, expected }) => {
    const entries = history.map((h) => ({
      event: h.event as PieceEvent,
      from: h.from as PieceStatus | null,
      to: h.to as PieceStatus,
      at: new Date(h.at),
    }));
    expect(daysInWorkshop(entries, new Date(now))).toEqual(expected);
  });

  it("no depende del orden en que llega el historial", () => {
    for (const { history, now, expected } of scenarios.daysInWorkshop) {
      const entries = history
        .map((h) => ({
          event: h.event as PieceEvent,
          from: h.from as PieceStatus | null,
          to: h.to as PieceStatus,
          at: new Date(h.at),
        }))
        .reverse();
      expect(daysInWorkshop(entries, new Date(now))).toEqual(expected);
    }
  });

  it("sin historial son 0 días", () => {
    expect(daysInWorkshop([], new Date())).toEqual({ days: 0, ongoing: false });
  });
});

describe("fulfillmentDays (escenarios compartidos con la BD)", () => {
  it.each(scenarios.fulfillmentDays)("$name", ({ piece, now, expected }) => {
    expect(
      fulfillmentDays(
        {
          status: piece.status as PieceStatus,
          registeredAt: new Date(piece.registeredAt),
          deliveredAt: piece.deliveredAt ? new Date(piece.deliveredAt) : null,
        },
        new Date(now),
      ),
    ).toEqual(expected);
  });
});

describe("calendarDaysBetween", () => {
  it("cuenta días calendario en Lima, no horas", () => {
    // 23:59 y 00:01 en Lima: dos minutos, pero un día calendario.
    expect(
      calendarDaysBetween(
        new Date("2026-10-02T04:59:00Z"),
        new Date("2026-10-02T05:01:00Z"),
      ),
    ).toBe(1);
    // 00:01 y 23:59 del mismo día en Lima: casi 24 horas, pero 0 días.
    expect(
      calendarDaysBetween(
        new Date("2026-10-02T05:01:00Z"),
        new Date("2026-10-03T04:59:00Z"),
      ),
    ).toBe(0);
  });

  it("cruza fin de año", () => {
    expect(
      calendarDaysBetween(
        new Date("2026-12-30T15:00:00Z"),
        new Date("2027-01-02T15:00:00Z"),
      ),
    ).toBe(3);
  });

  it("nunca es negativo", () => {
    expect(
      calendarDaysBetween(
        new Date("2026-10-05T15:00:00Z"),
        new Date("2026-10-01T15:00:00Z"),
      ),
    ).toBe(0);
  });
});
