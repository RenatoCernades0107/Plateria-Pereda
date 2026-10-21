import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseWhatsappQuoteFilters } from "@/domain/whatsapp-quotes";
import type { WhatsappQuoteListItem } from "@/server/whatsapp-quotes/queries";

import { WhatsappQuotesList } from "./whatsapp-quotes-list";

const quote: WhatsappQuoteListItem = {
  id: "q1",
  code: "CWA-00001",
  clientId: null,
  name: "Ana Pérez",
  contactName: null,
  customerPhone: "",
  status: "pedida_parcial",
  itemsCount: 3,
  pendingCount: 1,
  totalCents: 120_050,
  createdAt: "2026-10-01T15:00:00Z",
};

describe("WhatsappQuotesList", () => {
  it("como el listado de restauraciones: enlace, estado, piezas, total y orden", () => {
    render(
      <WhatsappQuotesList
        quotes={[quote]}
        filters={parseWhatsappQuoteFilters({ estado: "pedida_parcial" })}
        now={new Date("2026-10-06T15:00:00Z")}
        emptyMessage="Vacío"
      />,
    );
    const row = screen.getByTestId("cotizacion-CWA-00001");
    expect(
      within(row).getByRole("link", { name: "CWA-00001" }),
    ).toHaveAttribute("href", "/cotizaciones-whatsapp/q1");
    expect(row).toHaveTextContent("Ana Pérez");
    expect(row).toHaveTextContent("Pedida en parte");
    expect(row).toHaveTextContent("1 de 3 pendientes");
    expect(row).toHaveTextContent("hace 5 días");
    expect(row).toHaveTextContent("S/ 1,200.50");
    // Ordenar conserva los filtros y vuelve a la primera página.
    expect(
      screen.getByRole("link", { name: "Ordenar por total" }),
    ).toHaveAttribute(
      "href",
      "/cotizaciones-whatsapp?estado=pedida_parcial&orden=total",
    );
    expect(
      screen.getByRole("link", { name: "Ordenar por cliente" }),
    ).toHaveAttribute(
      "href",
      "/cotizaciones-whatsapp?estado=pedida_parcial&orden=client&dir=asc",
    );
    expect(screen.getByTestId("cotizacion-movil-CWA-00001")).toHaveTextContent(
      "Total S/ 1,200.50",
    );
  });

  it("sin cotizaciones muestra el vacío", () => {
    render(
      <WhatsappQuotesList
        quotes={[]}
        filters={parseWhatsappQuoteFilters({})}
        now={new Date()}
        emptyMessage="Aún no hay cotizaciones de WhatsApp."
      />,
    );
    expect(
      screen.getByText("Aún no hay cotizaciones de WhatsApp."),
    ).toBeInTheDocument();
  });
});
