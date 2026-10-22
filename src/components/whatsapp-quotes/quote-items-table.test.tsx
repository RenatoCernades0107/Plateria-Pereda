import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WhatsappQuoteItem } from "@/server/whatsapp-quotes/queries";

import { QuoteItemsTable } from "./quote-items-table";

const item = (overrides: Partial<WhatsappQuoteItem>): WhatsappQuoteItem => ({
  id: "i1",
  number: 1,
  quantity: 1,
  description: "Fuente ovalada",
  measure: "",
  materialIds: [],
  materialName: "",
  serviceIds: ["s1"],
  serviceName: "Limpieza",
  weightGrams: null,
  priceCents: 10_000,
  notes: "",
  order: null,
  ...overrides,
});

describe("QuoteItemsTable", () => {
  it("cada pieza con su foto de antes, servicio, estado y precio, como en la guía", () => {
    render(
      <QuoteItemsTable
        quoteCode="CWA-00001"
        items={[
          item({}),
          item({
            id: "i2",
            number: 2,
            quantity: 2,
            description: "Jarra",
            serviceIds: [],
            serviceName: "",
            priceCents: null,
            order: {
              restorationId: "r1",
              restorationCode: "RES-00009",
              pieceCode: "RES-00009-1",
            },
          }),
        ]}
        photos={{ i1: "https://cdn.test/antes.jpg" }}
        serviceNames={new Map([["s1", "Limpieza profunda"]])}
        totalCents={10_000}
      />,
    );
    const first = screen.getByTestId("item-1");
    expect(within(first).getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/antes.jpg",
    );
    expect(first).toHaveTextContent("Limpieza profunda");
    expect(first).toHaveTextContent("Pendiente");
    expect(first).toHaveTextContent("S/ 100.00");

    const second = screen.getByTestId("item-2");
    expect(second).toHaveTextContent("Sin foto de antes");
    expect(second).toHaveTextContent("Cantidad: 2");
    expect(second).toHaveTextContent("Por definir");
    expect(
      within(second).getByRole("link", { name: "RES-00009" }),
    ).toHaveAttribute("href", "/restauraciones/r1");
    expect(screen.getByTestId("total-cotizacion")).toHaveTextContent(
      "S/ 100.00",
    );
  });
});
