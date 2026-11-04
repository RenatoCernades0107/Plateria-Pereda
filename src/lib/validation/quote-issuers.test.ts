import { describe, expect, it } from "vitest";

import {
  quoteIssuerFormErrors,
  quoteIssuerSchema,
  type QuoteIssuerFormInput,
} from "./quote-issuers";

const sac: QuoteIssuerFormInput = {
  name: "PEREDA SAC",
  legalName: "PEREDA SAC",
  documentType: "ruc",
  documentNumber: "20557169866",
  bankName: "Banco de Crédito (BCP)",
  accountLabel: "CTA CTE soles",
  accountNumber: "1942229780029",
  cci: "00219400222978002998",
};

describe("quoteIssuerSchema", () => {
  it("acepta las sucursales del pedido", () => {
    expect(quoteIssuerFormErrors(sac)).toBeNull();
    expect(
      quoteIssuerFormErrors({
        ...sac,
        name: "CARMEN",
        legalName: "Regina Pereda Luque",
        documentType: "dni",
        documentNumber: "07863594",
        accountLabel: "CTA AHORRO soles",
        accountNumber: "19493993660088",
        cci: "00219419399366008899",
      }),
    ).toBeNull();
  });

  it("quita los espacios de los números", () => {
    const parsed = quoteIssuerSchema.parse({
      ...sac,
      documentNumber: " 20557169866 ",
      cci: "002 194 00222978002998",
    });
    expect(parsed.documentNumber).toBe("20557169866");
    expect(parsed.cci).toBe("00219400222978002998");
  });

  it("valida el RUC (dígito verificador), el DNI y el CCI", () => {
    expect(
      quoteIssuerFormErrors({ ...sac, documentNumber: "20557169867" }),
    ).toMatchObject({ documentNumber: "Ingresa un RUC válido (11 dígitos)" });
    expect(
      quoteIssuerFormErrors({
        ...sac,
        documentType: "dni",
        documentNumber: "123",
      }),
    ).toMatchObject({ documentNumber: "El DNI debe tener 8 dígitos" });
    expect(quoteIssuerFormErrors({ ...sac, cci: "123" })).toMatchObject({
      cci: "El CCI debe tener 20 dígitos",
    });
  });

  it("los textos son obligatorios", () => {
    expect(
      quoteIssuerFormErrors({ ...sac, name: " ", legalName: "" }),
    ).toMatchObject({
      name: "Ingresa el nombre",
      legalName: "Ingresa la razón social o el titular",
    });
  });
});
