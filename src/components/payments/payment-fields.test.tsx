import { describe, expect, it } from "vitest";

import { readDraft } from "./payment-fields";

const draft = (...rows: [string, string][]) => ({
  paidOn: "2026-10-12",
  rows: rows.map(([methodId, amount]) => ({ methodId, amount })),
});
const YAPE = "00000000-0000-0000-0000-000000000001";
const EFECTIVO = "00000000-0000-0000-0000-000000000002";

describe("readDraft: validación del pago (11.2)", () => {
  it("reparte el pago en varios métodos", () => {
    expect(readDraft(draft([YAPE, "150"], [EFECTIVO, "50,50"]), 40000)).toEqual(
      {
        input: {
          paidOn: "2026-10-12",
          rows: [
            { methodId: YAPE, amountCents: 15000 },
            { methodId: EFECTIVO, amountCents: 5050 },
          ],
        },
        totalCents: 20050,
      },
    );
  });

  it("el monto debe ser mayor que 0", () => {
    expect(readDraft(draft([YAPE, "0"]), 40000)).toEqual({
      error: "Ingresa un monto mayor que 0 (hasta 2 decimales).",
    });
    expect(readDraft(draft([YAPE, "abc"]), 40000)).toHaveProperty("error");
  });

  it("y no pasar del saldo", () => {
    expect(readDraft(draft([YAPE, "300"], [EFECTIVO, "101"]), 40000)).toEqual({
      error: "El monto supera el saldo pendiente (S/ 400.00).",
    });
  });

  it("cada fila necesita su método", () => {
    expect(readDraft(draft(["", "10"]), 40000)).toEqual({
      error: "Elige el método de pago.",
    });
  });
});
