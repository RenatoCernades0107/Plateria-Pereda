import { describe, expect, it } from "vitest";

import { amountInWords } from "./amount-in-words";

describe("amountInWords", () => {
  it("entero y céntimos, como en el 'Son:' de la cotización impresa", () => {
    expect(amountInWords(1_906_78)).toBe("MIL NOVECIENTOS SEIS Y 78/100 SOLES");
  });

  it("cero soles", () => {
    expect(amountInWords(0)).toBe("CERO Y 00/100 SOLES");
  });

  it("céntimos con un dígito se rellenan con 0", () => {
    expect(amountInWords(10_05)).toBe("DIEZ Y 05/100 SOLES");
  });

  it("decenas del 11 al 19, 'DIECI...' sin acentos", () => {
    expect(amountInWords(16_00)).toBe("DIECISEIS Y 00/100 SOLES");
  });

  it("veintitantos contraídos (VEINTIUNO, no VEINTE Y UNO)", () => {
    expect(amountInWords(21_00)).toBe("VEINTIUNO Y 00/100 SOLES");
    expect(amountInWords(29_00)).toBe("VEINTINUEVE Y 00/100 SOLES");
  });

  it("treinta y más, con 'Y' entre la decena y la unidad", () => {
    expect(amountInWords(31_00)).toBe("TREINTA Y UNO Y 00/100 SOLES");
    expect(amountInWords(99_00)).toBe("NOVENTA Y NUEVE Y 00/100 SOLES");
  });

  it("cien exacto vs. ciento + resto", () => {
    expect(amountInWords(100_00)).toBe("CIEN Y 00/100 SOLES");
    expect(amountInWords(101_00)).toBe("CIENTO UNO Y 00/100 SOLES");
    expect(amountInWords(500_00)).toBe("QUINIENTOS Y 00/100 SOLES");
  });

  it("mil sin 'UN' adelante (no 'UN MIL')", () => {
    expect(amountInWords(1_000_00)).toBe("MIL Y 00/100 SOLES");
  });

  it("miles compuestos, con apócope ante 'MIL' (VEINTIUN, no VEINTIUNO)", () => {
    expect(amountInWords(21_000_00)).toBe("VEINTIUN MIL Y 00/100 SOLES");
    expect(amountInWords(345_678_00)).toBe(
      "TRESCIENTOS CUARENTA Y CINCO MIL SEISCIENTOS SETENTA Y OCHO Y 00/100 SOLES",
    );
  });

  it("millones, con apócope ante 'MILLON(ES)'", () => {
    expect(amountInWords(1_000_000_00)).toBe("UN MILLON Y 00/100 SOLES");
    expect(amountInWords(21_000_000_00)).toBe(
      "VEINTIUN MILLONES Y 00/100 SOLES",
    );
  });

  it("montos negativos (no deberían ocurrir) se tratan como 0", () => {
    expect(amountInWords(-100)).toBe("CERO Y 00/100 SOLES");
  });
});
