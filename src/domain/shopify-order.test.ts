import { describe, expect, it } from "vitest";

import {
  chargedPieces,
  linesToFulfill,
  orderLinesChange,
  orderLineTitle,
  pieceLineIds,
  type OrderLine,
  type OrderPiece,
} from "./shopify-order";

const piece = (n: number, extra: Partial<OrderPiece> = {}): OrderPiece => ({
  id: `p${n}`,
  code: `RES-00001-${n}`,
  priceCents: 10000 * n,
  status: "aprobada",
  approved: true,
  ...extra,
});

const line = (n: number, extra: Partial<OrderLine> = {}): OrderLine => ({
  id: `l${n}`,
  title: orderLineTitle(`RES-00001-${n}`),
  priceCents: 10000 * n,
  fulfilled: false,
  ...extra,
});

describe("orden de Shopify (Fase 9)", () => {
  it("una línea por pieza con el título del código (D30)", () => {
    expect(orderLineTitle("RES-00001-2")).toBe("Restauración RES-00001-2");
  });

  it("se cobran las piezas aprobadas que no están cerradas", () => {
    const pieces = [
      piece(1),
      piece(2, { status: "anulada" }),
      piece(3, { status: "rechazada", approved: false }),
      piece(4, { status: "sin_arreglo" }),
      piece(5, { status: "registrada", approved: false }),
      piece(6, { status: "entregada" }),
    ];
    expect(chargedPieces(pieces).map((p) => p.id)).toEqual(["p1", "p6"]);
  });

  it("sin cambios no edita la orden", () => {
    expect(
      orderLinesChange("RES-00001", [piece(1), piece(2)], [line(1), line(2)]),
    ).toBeNull();
  });

  it("quita la línea de una pieza anulada (P12)", () => {
    expect(
      orderLinesChange(
        "RES-00001",
        [piece(1), piece(2, { status: "anulada" })],
        [line(1), line(2)],
      ),
    ).toEqual({ addLines: [], removeLineIds: ["l2"], setPrices: [] });
  });

  it("ajusta un precio cambiado y agrega una pieza aprobada después", () => {
    expect(
      orderLinesChange(
        "RES-00001",
        [piece(1, { priceCents: 12550 }), piece(2), piece(3)],
        [line(1), line(2)],
      ),
    ).toEqual({
      addLines: [{ title: "Restauración RES-00001-3", priceCents: 30000 }],
      removeLineIds: [],
      setPrices: [{ lineId: "l1", priceCents: 12550 }],
    });
  });

  it("no agrega una pieza agregada que aún no se aprueba", () => {
    expect(
      orderLinesChange(
        "RES-00001",
        [piece(1), piece(2, { status: "en_consulta", approved: false })],
        [line(1)],
      ),
    ).toBeNull();
  });

  it("no toca líneas agregadas a mano en Shopify y quita duplicados", () => {
    const manual: OrderLine = {
      id: "x",
      title: "Envío",
      priceCents: 500,
      fulfilled: false,
    };
    expect(
      orderLinesChange(
        "RES-00001",
        [piece(1)],
        [line(1), manual, line(1, { id: "l1b" })],
      ),
    ).toEqual({ addLines: [], removeLineIds: ["l1b"], setPrices: [] });
  });

  it("no confunde piezas de otra restauración con prefijo parecido", () => {
    const other: OrderLine = {
      id: "o",
      title: "Restauración RES-000011-1",
      priceCents: 100,
      fulfilled: false,
    };
    expect(
      orderLinesChange("RES-00001", [piece(1)], [line(1), other]),
    ).toBeNull();
  });

  it("prepara solo las líneas de piezas entregadas que faltan (P44)", () => {
    const pieces = [
      piece(1, { status: "entregada" }),
      piece(2, { status: "entregada" }),
      piece(3),
    ];
    expect(
      linesToFulfill(pieces, [line(1), line(2, { fulfilled: true }), line(3)]),
    ).toEqual(["l1"]);
  });

  it("guarda el id de línea de cada pieza (null si ya no está en la orden)", () => {
    expect(
      pieceLineIds([piece(1), piece(2, { status: "anulada" })], [line(1)]),
    ).toEqual([
      { pieceId: "p1", lineId: "l1" },
      { pieceId: "p2", lineId: null },
    ]);
  });
});
