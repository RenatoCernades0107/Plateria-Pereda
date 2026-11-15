import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TrackingQuoteItem } from "@/server/quotes/queries";

import { TrackingQuotesList } from "./tracking-quotes-list";

vi.mock("@/server/quotes/actions", () => ({ getWorkshopQuotes: vi.fn() }));
vi.mock("./quote-workshop-export", () => ({ exportWorkshopPdf: vi.fn() }));

const quote: TrackingQuoteItem = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "COT-000001",
  status: "aceptada",
  clientName: "Ana Torres",
  deliveryDate: null,
  supplierDeliveryDate: null,
  workLocation: "en_tienda",
  workshopId: "22222222-2222-4222-8222-222222222222",
  workshopName: "Taller Norte",
  itemsCount: 2,
};

describe("TrackingQuotesList (logística)", () => {
  it("muestra el taller y la ubicación, sin importes", () => {
    const { container } = render(
      <TrackingQuotesList quotes={[quote]} empty={null} />,
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Taller", "Ubicación"]));
    expect(headers).not.toContain("Total");
    expect(headers).not.toContain("Saldo pendiente");
    const row = screen.getByTestId("cotizacion-COT-000001");
    expect(row).toHaveTextContent("Taller Norte");
    expect(row).toHaveTextContent("En tienda");
    expect(container).not.toHaveTextContent("S/");
  });

  it("indica cuando falta el taller o la ubicación", () => {
    render(
      <TrackingQuotesList
        quotes={[
          {
            ...quote,
            workLocation: null,
            workshopId: null,
            workshopName: null,
          },
        ]}
        empty={null}
      />,
    );
    const row = screen.getByTestId("cotizacion-COT-000001");
    expect(row).toHaveTextContent("Sin taller");
    expect(row).toHaveTextContent("Sin definir");
  });
});
