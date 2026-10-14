import { describe, expect, it } from "vitest";

import { CLOSED_STATUSES, PIECE_STATUSES } from "./piece-state-machine";
import {
  editableFields,
  PIECE_FREE_FIELDS,
  SALES_PIECE_FIELDS,
} from "./restoration-edit";

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

  it("antes de la orden, ventas y admin editan todo; el precio de venta solo el admin (D58)", () => {
    for (const role of ["admin", "ventas"] as const) {
      const fields = editableFields(
        { role, hasOrder: false },
        { status: "aprobada", priceCents: 10_000 },
      );
      if (role === "admin") expect(fields.piece).toContain("price");
      else expect(fields.piece).toEqual(SALES_PIECE_FIELDS);
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
      { status: "aprobada", priceCents: 10_000 },
    );
    expect(ventas.piece).toEqual(SALES_PIECE_FIELDS);
    expect(ventas.piece).not.toContain("price");
    expect(ventas.priceNeedsOrderFlow).toBe(false);
    expect(ventas.restoration).toContain("paymentType");

    const admin = editableFields(
      { role: "admin", hasOrder: true },
      { status: "aprobada", priceCents: 10_000 },
    );
    expect(admin.piece).not.toContain("price");
    expect(admin.priceNeedsOrderFlow).toBe(true);
  });

  it("una pieza sin precio lo recibe del admin aunque exista la orden o ya se entregó (D58)", () => {
    for (const status of ["aprobada", "entregada"] as const) {
      const admin = editableFields(
        { role: "admin", hasOrder: true },
        { status, priceCents: null },
      );
      expect(admin.piece).toContain("price");
      expect(admin.priceNeedsOrderFlow).toBe(false);
      expect(
        editableFields(
          { role: "ventas", hasOrder: true },
          { status, priceCents: null },
        ).piece,
      ).not.toContain("price");
    }
    expect(
      editableFields(
        { role: "admin", hasOrder: false },
        { status: "entregada", priceCents: 500 },
      ).piece,
    ).toEqual(["notes"]);
  });

  it("una pieza anulada, rechazada o sin arreglo no se edita y de una entregada solo las notas", () => {
    for (const hasOrder of [false, true]) {
      for (const status of CLOSED_STATUSES) {
        expect(
          editableFields({ role: "admin", hasOrder }, { status }).piece,
        ).toEqual([]);
      }
      expect(
        editableFields(
          { role: "ventas", hasOrder },
          { status: "entregada", priceCents: null },
        ).piece,
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
      ).toEqual(SALES_PIECE_FIELDS);
      expect(
        editableFields(
          { role: "admin", hasOrder: true },
          { status, priceCents: 1000 },
        ).piece,
      ).toEqual(PIECE_FREE_FIELDS);
    }
  });

  it("el taller lo cambia el admin, no ventas (D60)", () => {
    expect(SALES_PIECE_FIELDS).not.toContain("workshopId");
    for (const piece of [undefined, { status: "aprobada" as const }]) {
      expect(
        editableFields({ role: "admin", hasOrder: false }, piece).piece,
      ).toContain("workshopId");
      expect(
        editableFields({ role: "ventas", hasOrder: false }, piece).piece,
      ).not.toContain("workshopId");
    }
  });

  it("sin pieza informa los campos de una pieza nueva: el precio solo para el admin", () => {
    expect(editableFields({ role: "ventas", hasOrder: false })).toMatchObject({
      piece: SALES_PIECE_FIELDS,
      canAddPieces: true,
    });
    expect(editableFields({ role: "admin", hasOrder: true }).piece).toContain(
      "price",
    );
  });
});
