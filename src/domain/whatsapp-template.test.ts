import { describe, expect, it } from "vitest";

import {
  DEFAULT_WHATSAPP_TEMPLATE,
  renderWhatsAppTemplate,
  unknownPlaceholders,
} from "./whatsapp-template";

describe("plantilla de WhatsApp", () => {
  it("la plantilla por defecto solo usa variables conocidas", () => {
    expect(unknownPlaceholders(DEFAULT_WHATSAPP_TEMPLATE)).toEqual([]);
  });

  it("detecta variables mal escritas, sin repetirlas", () => {
    expect(unknownPlaceholders("Hola {clienet}, {total} {clienet} {}")).toEqual(
      ["clienet", ""],
    );
  });

  it("reemplaza las variables y deja vacías las que no tienen valor", () => {
    expect(
      renderWhatsAppTemplate(
        "Hola {cliente}.\n\n\n\n{condiciones}\nTotal: {total} {otra}",
        {
          cliente: "Ana",
          total: "100.00",
        },
      ),
    ).toBe("Hola Ana.\n\nTotal: 100.00 {otra}");
  });
});
