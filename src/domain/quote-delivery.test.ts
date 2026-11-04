import { describe, expect, it } from "vitest";

import {
  defaultSupplierDeliveryDate,
  QUOTE_DELIVERY_DATE_PAST,
  QUOTE_DELIVERY_DATE_REQUIRED,
  quoteDeliveryDatesError,
  SUPPLIER_DATE_AFTER_DELIVERY,
  SUPPLIER_DATE_PAST,
} from "./quote-delivery";
import { DELIVERY_DATE_INVALID } from "./delivery-date";

const TODAY = "2026-11-03";

describe("defaultSupplierDeliveryDate", () => {
  it("queda 3 días antes de la entrega", () => {
    expect(defaultSupplierDeliveryDate("2026-11-20", TODAY)).toBe("2026-11-17");
    expect(defaultSupplierDeliveryDate("2026-12-02", TODAY)).toBe("2026-11-29");
  });

  it("no pasa de hoy", () => {
    expect(defaultSupplierDeliveryDate("2026-11-04", TODAY)).toBe(TODAY);
  });
});

describe("quoteDeliveryDatesError", () => {
  it("acepta fechas válidas o la del proveedor en blanco", () => {
    expect(quoteDeliveryDatesError("2026-11-20", "2026-11-17", TODAY)).toBe(
      null,
    );
    expect(quoteDeliveryDatesError("2026-11-20", "", TODAY)).toBe(null);
    expect(quoteDeliveryDatesError(TODAY, TODAY, TODAY)).toBe(null);
  });

  it("pide la fecha de entrega válida y no pasada", () => {
    expect(quoteDeliveryDatesError("", "", TODAY)).toBe(
      QUOTE_DELIVERY_DATE_REQUIRED,
    );
    expect(quoteDeliveryDatesError("2026-02-30", "", TODAY)).toBe(
      DELIVERY_DATE_INVALID,
    );
    expect(quoteDeliveryDatesError("2026-11-02", "", TODAY)).toBe(
      QUOTE_DELIVERY_DATE_PAST,
    );
  });

  it("la del proveedor no es pasada ni posterior a la entrega", () => {
    expect(quoteDeliveryDatesError("2026-11-20", "2026-11-01", TODAY)).toBe(
      SUPPLIER_DATE_PAST,
    );
    expect(quoteDeliveryDatesError("2026-11-20", "2026-11-21", TODAY)).toBe(
      SUPPLIER_DATE_AFTER_DELIVERY,
    );
    expect(quoteDeliveryDatesError("2026-11-20", "x", TODAY)).toBe(
      DELIVERY_DATE_INVALID,
    );
  });

  it("las fechas que no cambian pueden haber pasado", () => {
    const current = { deliveryDate: "2026-11-01", supplierDate: "2026-10-29" };
    expect(
      quoteDeliveryDatesError("2026-11-01", "2026-10-29", TODAY, current),
    ).toBe(null);
  });
});
