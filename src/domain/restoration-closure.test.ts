import { describe, expect, it } from "vitest";

import type { PieceStatus } from "./piece-state-machine";
import {
  isRestorationCloseTarget,
  planRestorationClosure,
  type ClosurePiece,
} from "./restoration-closure";

const piece = (
  code: string,
  status: PieceStatus,
  extra: Partial<ClosurePiece> = {},
): ClosurePiece => ({
  id: `id-${code}`,
  code,
  status,
  arrivedAt: null,
  workshopId: null,
  firstSentAt: null,
  readyForDelivery: false,
  returnedAt: null,
  approvedAt: null,
  ...extra,
});

const note = { note: "El cliente desistió" };

describe("planRestorationClosure", () => {
  it("solo acepta Anulada o Rechazada", () => {
    expect(isRestorationCloseTarget("anulada")).toBe(true);
    expect(isRestorationCloseTarget("rechazada")).toBe(true);
    expect(isRestorationCloseTarget("lista")).toBe(false);
  });

  it("anula las piezas vivas y deja las ya cerradas", () => {
    const plan = planRestorationClosure(
      [
        piece("P1", "registrada"),
        piece("P2", "aprobada", { approvedAt: new Date() }),
        piece("P3", "anulada"),
      ],
      "anulada",
      "ventas",
      note,
    );
    expect(plan).toEqual({
      ok: true,
      pieceIds: ["id-P1", "id-P2"],
      skipped: 1,
      result: "anulada",
    });
  });

  it("anular con una pieza ya rechazada deja la guía Rechazada", () => {
    const plan = planRestorationClosure(
      [piece("P1", "registrada"), piece("P2", "rechazada")],
      "anulada",
      "admin",
      note,
    );
    expect(plan).toMatchObject({ ok: true, result: "rechazada" });
  });

  it("bloquea si hay piezas entregadas", () => {
    const plan = planRestorationClosure(
      [piece("P1", "registrada"), piece("P2", "entregada")],
      "anulada",
      "admin",
      note,
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error).toContain("P2 (Entregada)");
      expect(plan.error).toContain("entregadas no se anulan");
    }
  });

  it("una pieza en el taller solo la anula el administrador", () => {
    const pieces = [piece("P1", "enviada_taller", { workshopId: "w" })];
    expect(planRestorationClosure(pieces, "anulada", "admin", note).ok).toBe(
      true,
    );
    const plan = planRestorationClosure(pieces, "anulada", "ventas", note);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toContain("administrador");
  });

  it("rechaza solo piezas en espera de respuesta", () => {
    expect(
      planRestorationClosure(
        [piece("P1", "en_espera"), piece("P2", "sin_arreglo")],
        "rechazada",
        "ventas",
        note,
      ),
    ).toMatchObject({ ok: true, pieceIds: ["id-P1"], result: "rechazada" });
    const plan = planRestorationClosure(
      [piece("P1", "en_espera"), piece("P2", "registrada")],
      "rechazada",
      "ventas",
      note,
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toContain("Espera respuesta cliente");
  });

  it("pide motivo y piezas por cerrar", () => {
    expect(
      planRestorationClosure([piece("P1", "registrada")], "anulada", "admin"),
    ).toMatchObject({ ok: false, error: expect.stringContaining("motivo") });
    expect(
      planRestorationClosure(
        [piece("P1", "anulada")],
        "anulada",
        "admin",
        note,
      ),
    ).toMatchObject({ ok: false });
    expect(planRestorationClosure([], "anulada", "admin", note)).toMatchObject({
      ok: false,
    });
  });
});
