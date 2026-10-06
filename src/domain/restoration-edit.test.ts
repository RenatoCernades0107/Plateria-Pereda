import { describe, expect, it } from "vitest";

import { CLOSED_STATUSES, PIECE_STATUSES } from "./piece-state-machine";
import { editableFields, PIECE_FREE_FIELDS } from "./restoration-edit";

describe("editableFields", () => {
  it("logística no edita nada", () => {
    for (const hasOrder of [false, true]) {
      expect(
        editableFields(
          { role: "logistica", hasOrder },
          { status: "registrada" },
        ),
      ).toEqual({
        restoration: [],
        piece: [],
        priceNeedsOrderFlow: false,
        canAddPieces: false,
      });
    }
  });

  it("antes de la orden, ventas y admin editan todo, incluido el precio", () => {
    for (const role of ["admin", "ventas"] as const) {
      const fields = editableFields(
        { role, hasOrder: false },
        { status: "aprobada" },
      );
      expect(fields.piece).toContain("price");
      expect(fields.restoration).toEqual([
        "contactId",
        "paymentType",
        "depositPercent",
        "notes",
      ]);
      expect(fields.canAddPieces).toBe(true);
    }
  });

  it("con la orden creada, el precio sale de la edición directa; solo admin sigue el flujo de P12", () => {
    const ventas = editableFields(
      { role: "ventas", hasOrder: true },
      { status: "aprobada" },
    );
    expect(ventas.piece).toEqual(PIECE_FREE_FIELDS);
    expect(ventas.piece).not.toContain("price");
    expect(ventas.priceNeedsOrderFlow).toBe(false);
    expect(ventas.restoration).toContain("paymentType");

    const admin = editableFields(
      { role: "admin", hasOrder: true },
      { status: "aprobada" },
    );
    expect(admin.piece).not.toContain("price");
    expect(admin.priceNeedsOrderFlow).toBe(true);
  });

  it("una pieza anulada, rechazada o sin arreglo no se edita y de una entregada solo las notas", () => {
    for (const hasOrder of [false, true]) {
      for (const status of CLOSED_STATUSES) {
        expect(
          editableFields({ role: "admin", hasOrder }, { status }).piece,
        ).toEqual([]);
      }
      expect(
        editableFields({ role: "ventas", hasOrder }, { status: "entregada" })
          .piece,
      ).toEqual(["notes"]);
    }
  });

  it("los demás estados editan los campos libres", () => {
    const others = PIECE_STATUSES.filter(
      (s) => !CLOSED_STATUSES.includes(s) && s !== "entregada",
    );
    for (const status of others) {
      expect(
        editableFields({ role: "ventas", hasOrder: true }, { status }).piece,
      ).toEqual(PIECE_FREE_FIELDS);
    }
  });

  it("sin pieza solo informa la restauración y si se pueden agregar piezas", () => {
    expect(editableFields({ role: "ventas", hasOrder: false })).toMatchObject({
      piece: [],
      canAddPieces: true,
    });
  });
});
