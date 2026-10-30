import { describe, expect, it } from "vitest";

import { CLOSED_STATUSES, PIECE_STATUSES } from "./piece-state-machine";
import {
  editableFields,
  PIECE_FREE_FIELDS,
  salePriceEditing,
  SALES_PIECE_FIELDS,
} from "./restoration-edit";

describe("editableFields", () => {
  it("logística edita los campos de la pieza como el admin, pero no la guía ni agrega piezas", () => {
    expect(
      editableFields(
        { role: "logistica", hasOrder: false },
        { status: "registrada" },
      ),
    ).toEqual({
      restoration: [],
      piece: [...PIECE_FREE_FIELDS, "price"],
      priceNeedsOrderFlow: false,
      canAddPieces: false,
    });
    expect(
      editableFields(
        { role: "logistica", hasOrder: true },
        { status: "registrada", priceCents: 1000 },
      ),
    ).toEqual({
      restoration: [],
      piece: PIECE_FREE_FIELDS,
      priceNeedsOrderFlow: true,
      canAddPieces: false,
    });
  });

  it("antes de la orden, ventas y admin editan todo, también el precio de venta", () => {
    for (const role of ["admin", "ventas"] as const) {
      const fields = editableFields(
        { role, hasOrder: false },
        { status: "aprobada", priceCents: 10_000 },
      );
      expect(fields.piece).toContain("price");
      if (role === "ventas")
        expect(fields.piece).toEqual([...SALES_PIECE_FIELDS, "price"]);
      expect(fields.restoration).toEqual([
        "contactId",
        "paymentType",
        "depositPercent",
        "notes",
      ]);
      expect(fields.canAddPieces).toBe(true);
    }
  });

  it("con la orden creada, el precio sale de la edición directa y sigue el flujo de P12", () => {
    const ventas = editableFields(
      { role: "ventas", hasOrder: true },
      { status: "aprobada", priceCents: 10_000 },
    );
    expect(ventas.piece).toEqual(SALES_PIECE_FIELDS);
    expect(ventas.piece).not.toContain("price");
    expect(ventas.priceNeedsOrderFlow).toBe(true);
    expect(ventas.restoration).toContain("paymentType");

    const admin = editableFields(
      { role: "admin", hasOrder: true },
      { status: "aprobada", priceCents: 10_000 },
    );
    expect(admin.piece).not.toContain("price");
    expect(admin.priceNeedsOrderFlow).toBe(true);
  });

  it("una pieza sin precio lo recibe del admin o ventas aunque exista la orden o ya se entregó (D58)", () => {
    for (const status of ["aprobada", "entregada"] as const) {
      for (const role of ["admin", "ventas"] as const) {
        const fields = editableFields(
          { role, hasOrder: true },
          { status, priceCents: null },
        );
        expect(fields.piece).toContain("price");
        expect(fields.priceNeedsOrderFlow).toBe(false);
      }
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
          { status: "entregada", priceCents: 500 },
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
        editableFields(
          { role: "ventas", hasOrder: true },
          { status, priceCents: 1000 },
        ).piece,
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

  it("sin pieza informa los campos de una pieza nueva, con el precio", () => {
    expect(editableFields({ role: "ventas", hasOrder: false })).toMatchObject({
      piece: [...SALES_PIECE_FIELDS, "price"],
      canAddPieces: true,
    });
    expect(editableFields({ role: "admin", hasOrder: true }).piece).toContain(
      "price",
    );
  });
});

describe("salePriceEditing", () => {
  const none = { editable: false, needsOrderFlow: false };

  it("admin, ventas y logística lo asignan sin la orden, o si falta", () => {
    for (const role of ["admin", "ventas", "logistica"] as const) {
      expect(
        salePriceEditing(
          { role, hasOrder: false },
          { status: "aprobada", priceCents: 1000 },
        ),
      ).toEqual({ editable: true, needsOrderFlow: false });
      expect(
        salePriceEditing(
          { role, hasOrder: true },
          { status: "aprobada", priceCents: null },
        ),
      ).toEqual({ editable: true, needsOrderFlow: false });
    }
  });

  it("con la orden creada, un precio asignado se cambia con motivo", () => {
    expect(
      salePriceEditing(
        { role: "logistica", hasOrder: true },
        { status: "aprobada", priceCents: 1000 },
      ),
    ).toEqual({ editable: false, needsOrderFlow: true });
  });

  it("cerradas no; entregadas solo si falta el precio", () => {
    for (const status of CLOSED_STATUSES) {
      expect(
        salePriceEditing(
          { role: "logistica", hasOrder: false },
          { status, priceCents: null },
        ),
      ).toEqual(none);
    }
    expect(
      salePriceEditing(
        { role: "logistica", hasOrder: true },
        { status: "entregada", priceCents: 1000 },
      ),
    ).toEqual(none);
    expect(
      salePriceEditing(
        { role: "logistica", hasOrder: true },
        { status: "entregada", priceCents: null },
      ),
    ).toEqual({ editable: true, needsOrderFlow: false });
  });
});
