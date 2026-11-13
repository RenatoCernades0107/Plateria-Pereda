import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkshopQuote } from "@/domain/quote-workshop-pdf";
import { getWorkshopQuotes } from "@/server/quotes/actions";
import type { QuoteListItem } from "@/server/quotes/queries";

import { exportWorkshopPdf } from "./quote-workshop-export";
import { QuotesList } from "./quotes-list";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/quotes/actions", () => ({ getWorkshopQuotes: vi.fn() }));
vi.mock("./quote-workshop-export", () => ({
  exportWorkshopPdf: vi.fn(() => Promise.resolve()),
}));

const quote = (id: string, code: string): QuoteListItem => ({
  id,
  code,
  status: "aceptada",
  clientName: "Ana Torres",
  contactName: null,
  issueDate: "2026-11-01",
  validUntil: "2026-11-16",
  total: 100_00,
  createdAt: "2026-11-01T15:00:00Z",
  deliveryDate: null,
  supplierDeliveryDate: null,
  workLocation: null,
  workshopName: null,
});
const quotes = [
  quote("11111111-1111-4111-8111-111111111111", "COT-000001"),
  quote("22222222-2222-4222-8222-222222222222", "COT-000002"),
];

afterEach(() => vi.clearAllMocks());

describe("QuotesList", () => {
  it("sin `selectable` no lleva casillas", () => {
    render(<QuotesList quotes={quotes} emptyMessage="Nada" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("exporta la orden para taller de las cotizaciones elegidas", async () => {
    const data: WorkshopQuote[] = [];
    vi.mocked(getWorkshopQuotes).mockResolvedValue({ ok: true, quotes: data });
    const user = userEvent.setup();
    render(<QuotesList selectable quotes={quotes} emptyMessage="Nada" />);
    expect(
      screen.queryByRole("region", {
        name: "Acciones para las cotizaciones elegidas",
      }),
    ).not.toBeInTheDocument();
    // La tabla (escritorio) y la lista (celular) llevan cada una su casilla.
    await user.click(
      screen.getAllByRole("checkbox", { name: "Elegir COT-000002" })[0]!,
    );
    const bar = screen.getByRole("region", {
      name: "Acciones para las cotizaciones elegidas",
    });
    expect(bar).toHaveTextContent("1 de 2 seleccionadas");
    await user.click(
      within(bar).getByRole("button", { name: "PDF para taller" }),
    );
    expect(getWorkshopQuotes).toHaveBeenCalledWith([quotes[1]!.id]);
    expect(exportWorkshopPdf).toHaveBeenCalledWith(data);
    expect(toast.success).toHaveBeenCalledWith(
      "Orden para taller exportada (1 cotización).",
    );
  });

  it("'Elegir todas' marca las de la página y 'Quitar selección' las quita", async () => {
    const user = userEvent.setup();
    render(<QuotesList selectable quotes={quotes} emptyMessage="Nada" />);
    await user.click(
      screen.getByRole("checkbox", { name: "Elegir todas las de esta página" }),
    );
    expect(screen.getByRole("region")).toHaveTextContent(
      "2 de 2 seleccionadas",
    );
    await user.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("si no se pueden leer las cotizaciones, avisa y no genera el PDF", async () => {
    vi.mocked(getWorkshopQuotes).mockResolvedValue({ error: "Sin datos." });
    const user = userEvent.setup();
    render(<QuotesList selectable quotes={quotes} emptyMessage="Nada" />);
    await user.click(
      screen.getByRole("checkbox", { name: "Elegir todas las de esta página" }),
    );
    await user.click(screen.getByRole("button", { name: "PDF para taller" }));
    expect(toast.error).toHaveBeenCalledWith("Sin datos.");
    expect(exportWorkshopPdf).not.toHaveBeenCalled();
  });
});
