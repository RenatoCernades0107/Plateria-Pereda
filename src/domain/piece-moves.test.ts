import { describe, expect, it } from "vitest";

import {
  checkMove,
  isLastToApprove,
  moveTargets,
  pieceKanbanColumns,
} from "./piece-moves";
import { PIECE_STATUSES, type PieceStatus } from "./piece-state-machine";

const piece = (
  status: PieceStatus,
  patch: {
    arrivedAt?: Date | null;
    readyForDelivery?: boolean;
    firstSentAt?: Date | null;
    lastSentAt?: Date | null;
  } = {},
) => ({
  status,
  arrivedAt: null,
  readyForDelivery: false,
  ...patch,
});

describe("moveTargets", () => {
  it("son los destinos de la máquina de estados para el rol", () => {
    expect(moveTargets(piece("registrada"), "ventas")).toEqual([
      "en_consulta",
      "aprobada",
      "anulada",
    ]);
    // Logística no consulta, aprueba ni anula.
    expect(moveTargets(piece("registrada"), "logistica")).toEqual([]);
  });

  it("respetan la condición física: se entrega solo lo que volvió del taller", () => {
    expect(moveTargets(piece("aprobada"), "admin")).not.toContain("entregada");
    expect(
      moveTargets(piece("aprobada", { readyForDelivery: true }), "admin"),
    ).toContain("entregada");
  });
});

describe("checkMove", () => {
  it("devuelve la transición cuando se puede", () => {
    const check = checkMove(piece("registrada"), "en_consulta", "ventas");
    expect(check).toMatchObject({
      ok: true,
      transition: { to: "en_consulta", requiresNote: true },
    });
  });

  it("explica que no existe el paso entre los dos estados", () => {
    expect(checkMove(piece("registrada"), "entregada", "admin")).toEqual({
      ok: false,
      reason: "No se puede pasar de «Registrada» a «Entregada».",
    });
  });

  it("explica que el rol no puede hacer el cambio", () => {
    expect(checkMove(piece("registrada"), "aprobada", "logistica")).toEqual({
      ok: false,
      reason: "Tu rol no puede pasar piezas de «Registrada» a «Aprobada».",
    });
  });

  it("explica la condición física que lo impide", () => {
    expect(checkMove(piece("aprobada"), "entregada", "admin")).toEqual({
      ok: false,
      reason: "La pieza aún no pasó por el taller.",
    });
    const sent = new Date("2026-10-02T15:00:00Z");
    expect(
      checkMove(
        piece("aprobada", { firstSentAt: sent, lastSentAt: sent }),
        "entregada",
        "admin",
      ),
    ).toEqual({ ok: false, reason: "La pieza sigue en el taller." });
    expect(
      checkMove(
        piece("aprobada", { firstSentAt: sent, lastSentAt: sent }),
        "anulada",
        "ventas",
      ),
    ).toEqual({
      ok: false,
      reason: "La pieza está en el taller: solo el administrador la anula.",
    });
  });
});

describe("pieceKanbanColumns", () => {
  it("todos los estados en orden; los no visibles, solo como destino", () => {
    const columns = pieceKanbanColumns(["registrada", "aprobada"]);
    expect(columns.map((c) => c.status)).toEqual([...PIECE_STATUSES]);
    expect(columns.filter((c) => !c.dropOnly).map((c) => c.status)).toEqual([
      "registrada",
      "aprobada",
    ]);
  });
});

describe("isLastToApprove", () => {
  it("es la única pieza que falta aprobar", () => {
    const pieces = [
      { id: "a", status: "aprobada" as const },
      { id: "b", status: "en_espera" as const },
    ];
    expect(isLastToApprove(pieces, "b")).toBe(true);
    expect(isLastToApprove(pieces, "a")).toBe(false);
    expect(
      isLastToApprove(
        [...pieces, { id: "c", status: "registrada" as const }],
        "b",
      ),
    ).toBe(false);
  });
});
