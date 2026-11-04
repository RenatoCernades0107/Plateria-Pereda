import { describe, expect, it } from "vitest";

import { freeLine, lineFromCatalog, type QuoteLineDraft } from "./quote-line";
import {
  DEFAULT_COMPANY_ADDRESS,
  quotePdfFileName,
  quotePdfLineFromDraft,
  QuotePdfMissingIssuerError,
  quotePdfModel,
  quoteShareMessage,
  type QuotePdfData,
} from "./quote-pdf";

const baseData: QuotePdfData = {
  company: {
    name: "Platería Pereda",
    address: "Calle Coronel Inclán 928, Miraflores",
  },
  code: "COT-000001",
  issueDate: "2026-08-17",
  validityDays: 7,
  paymentCondition: "contado",
  creditDays: null,
  issuer: {
    id: "55555555-5555-4555-8555-555555555555",
    name: "PEREDA SAC",
    legalName: "PEREDA SAC",
    documentType: "ruc",
    documentNumber: "20557169866",
    bankName: "Banco de Crédito (BCP)",
    accountLabel: "CTA CTE soles",
    accountNumber: "1942229780029",
    cci: "00219400222978002998",
    active: true,
  },
  deliveryDays: 30,
  clientName: "Lorena Rodríguez di Laura",
  contactName: "Lorena Rodríguez di Laura",
  lines: [
    {
      sku: "TNS01",
      description: "Escultura en madera · Pelota de tenis en plata 950",
      quantity: 1,
      unitPrice: 1_906_78,
    },
  ],
  applyIgv: false,
  notes: "",
  terms: "",
};

describe("quotePdfFileName", () => {
  it("usa el código, sin caracteres raros", () => {
    expect(quotePdfFileName("COT-000001")).toBe("cotizacion-COT-000001.pdf");
  });
});

describe("quotePdfLineFromDraft", () => {
  it("une título, variante y personalización en la descripción", () => {
    const product = {
      id: "p1",
      title: "Anillo",
      imageUrl: null,
      variants: [],
    };
    const variant = {
      id: "v1",
      title: "Talla 7",
      price: "150.00",
      sku: "AN-7",
      imageUrl: null,
    };
    const line = lineFromCatalog(product, variant, "k1");
    const draft: QuoteLineDraft = { ...line, customization: "Grabado: ABC" };
    const result = quotePdfLineFromDraft(draft);
    expect(result.sku).toBe("AN-7");
    expect(result.description).toBe("Anillo · Talla 7 · Grabado: ABC");
    expect(result.unitPrice).toBe(150_00);
  });

  it("línea libre sin SKU", () => {
    const draft: QuoteLineDraft = {
      ...freeLine("k2"),
      title: "Producto a medida",
      unitPrice: "80.00",
    };
    const result = quotePdfLineFromDraft(draft);
    expect(result.sku).toBeNull();
    expect(result.description).toBe("Producto a medida");
  });
});

describe("quotePdfModel", () => {
  it("arma el encabezado, la tabla y los totales", () => {
    const model = quotePdfModel(baseData);
    expect(model.dateLine).toBe("Miraflores, 17 de agosto de 2026");
    expect(model.companyAddress).toBe(baseData.company.address);
    expect(model.rows).toEqual([
      {
        sku: "TNS01",
        description: baseData.lines[0]!.description,
        quantity: "1",
        unitPrice: "S/ 1,906.78",
        total: "S/ 1,906.78",
      },
    ]);
    expect(model.subtotal).toBe("S/ 1,906.78");
    expect(model.discount).toBeNull();
    expect(model.igv).toBeNull();
    expect(model.total).toBe("S/ 1,906.78");
    expect(model.amountInWords).toBe("MIL NOVECIENTOS SEIS Y 78/100 SOLES");
    expect(model.validityText).toContain("validez de 7 días");
    expect(model.validityText).toContain("24 de agosto de 2026");
    expect(model.signer).toBe("Platería Pereda");
    expect(model.paymentConditionText).toBe("Al contado");
    expect(model.deliveryText).toBe("30 días hábiles desde su aprobación");
  });

  it("con IGV: fila del IGV y total y monto en letras con IGV", () => {
    const model = quotePdfModel({ ...baseData, applyIgv: true });
    expect(model.subtotal).toBe("S/ 1,906.78");
    // 1,906.78 × 18 % = 343.2204 → 343.22.
    expect(model.igv).toBe("S/ 343.22");
    expect(model.total).toBe("S/ 2,250.00");
    expect(model.amountInWords).toBe(
      "DOS MIL DOSCIENTOS CINCUENTA Y 00/100 SOLES",
    );
    // Los precios de la tabla siguen sin IGV.
    expect(model.rows[0]!.unitPrice).toBe("S/ 1,906.78");
    expect(model.rows[0]!.total).toBe("S/ 1,906.78");
  });

  it("con IGV y descuento, el IGV va sobre subtotal − descuentos", () => {
    const model = quotePdfModel({
      ...baseData,
      applyIgv: true,
      lines: [
        {
          ...baseData.lines[0]!,
          discount: { type: "porcentaje", percent: 10 },
        },
      ],
    });
    // 1,906.78 − 190.68 = 1,716.10; IGV 308.898 → 308.90; total 2,025.00.
    expect(model.discount).toBe("S/ 190.68");
    expect(model.igv).toBe("S/ 308.90");
    expect(model.total).toBe("S/ 2,025.00");
  });

  it("condición de pago con su etiqueta; crédito con sus días", () => {
    expect(
      quotePdfModel({
        ...baseData,
        paymentCondition: "credito",
        creditDays: 30,
      }).paymentConditionText,
    ).toBe("Crédito a 30 días");
    expect(
      quotePdfModel({ ...baseData, paymentCondition: "credito", creditDays: 1 })
        .paymentConditionText,
    ).toBe("Crédito a 1 día");
    expect(
      quotePdfModel({ ...baseData, paymentCondition: "a_cuenta" })
        .paymentConditionText,
    ).toBe("A cuenta");
  });

  it("sin sucursal no se genera el PDF", () => {
    expect(() => quotePdfModel({ ...baseData, issuer: null })).toThrow(
      QuotePdfMissingIssuerError,
    );
  });

  it("con RUC: razón social, RUC y cuenta de la sucursal", () => {
    expect(quotePdfModel(baseData).issuerLines).toEqual([
      "Razón social: PEREDA SAC",
      "RUC: 20557169866",
      "Banco de Crédito (BCP)",
      "CTA CTE soles: 1942229780029; CCI: 00219400222978002998",
    ]);
  });

  it("con DNI (CARMEN): solo la cuenta bancaria", () => {
    const model = quotePdfModel({
      ...baseData,
      issuer: {
        ...baseData.issuer!,
        name: "CARMEN",
        legalName: "Regina Pereda Luque",
        documentType: "dni",
        documentNumber: "07863594",
        accountLabel: "CTA AHORRO soles",
        accountNumber: "19493993660088",
        cci: "00219419399366008899",
      },
    });
    expect(model.issuerLines).toEqual([
      "Banco de Crédito (BCP)",
      "CTA AHORRO soles: 19493993660088; CCI: 00219419399366008899",
    ]);
  });

  it("un día de entrega va en singular", () => {
    const model = quotePdfModel({ ...baseData, deliveryDays: 1 });
    expect(model.deliveryText).toBe("1 día hábil desde su aprobación");
  });

  it("muestra el descuento solo cuando hay alguno", () => {
    const withDiscount = quotePdfModel({
      ...baseData,
      lines: [
        {
          ...baseData.lines[0]!,
          discount: { type: "porcentaje", percent: 10 },
        },
      ],
    });
    expect(withDiscount.discount).toBe("S/ 190.68");
    expect(withDiscount.total).toBe("S/ 1,716.10");
  });

  it("un día de vigencia va en singular", () => {
    const model = quotePdfModel({ ...baseData, validityDays: 1 });
    expect(model.validityText).toContain("validez de 1 día,");
  });

  it("línea sin SKU (producto libre o sin catálogo)", () => {
    const model = quotePdfModel({
      ...baseData,
      lines: [{ ...baseData.lines[0]!, sku: null }],
    });
    expect(model.rows[0]!.sku).toBe("");
  });

  it("dirección sin coma: la ciudad es la dirección completa", () => {
    const model = quotePdfModel({
      ...baseData,
      company: { ...baseData.company, address: "Miraflores" },
    });
    expect(model.dateLine).toBe("Miraflores, 17 de agosto de 2026");
  });

  it("sin dirección de la empresa, usa la dirección por defecto (y su ciudad)", () => {
    for (const address of ["", "   "]) {
      const model = quotePdfModel({
        ...baseData,
        company: { ...baseData.company, address },
      });
      expect(model.companyAddress).toBe(DEFAULT_COMPANY_ADDRESS);
      expect(model.dateLine).toBe("Miraflores, 17 de agosto de 2026");
    }
  });
});

describe("quoteShareMessage", () => {
  it("saluda por el nombre del cliente", () => {
    expect(quoteShareMessage("COT-000001", "Ana")).toBe(
      "Hola Ana, te comparto la cotización COT-000001. Cualquier consulta, con gusto te ayudamos.",
    );
  });

  it("sin nombre, saludo genérico", () => {
    expect(quoteShareMessage("COT-000001", "")).toBe(
      "Hola, te comparto la cotización COT-000001. Cualquier consulta, con gusto te ayudamos.",
    );
  });
});
