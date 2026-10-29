import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClientWorkTabs } from "./client-work-tabs";

const CLIENT_ID = "33333333-3333-4333-8333-333333333333";

const props = {
  clientId: CLIENT_ID,
  restorations: [],
  restorationsTotal: 0,
  quotes: [],
  quotesTotal: 0,
  showMoney: true,
  showQuotes: true,
  customQuotes: [],
  customQuotesTotal: 0,
  showCustomQuotes: true,
};

describe("ClientWorkTabs", () => {
  it("muestra la pestaña de cotizaciones personalizadas con su total", () => {
    render(<ClientWorkTabs {...props} customQuotesTotal={3} />);
    expect(
      screen.getByRole("tab", { name: /Cotizaciones personalizadas \(3\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Cotizaciones de WhatsApp \(0\)/ }),
    ).toBeInTheDocument();
  });

  it("sin permiso del cotizador no muestra la pestaña", () => {
    render(<ClientWorkTabs {...props} showCustomQuotes={false} />);
    expect(
      screen.queryByRole("tab", { name: /Cotizaciones personalizadas/ }),
    ).not.toBeInTheDocument();
  });
});
