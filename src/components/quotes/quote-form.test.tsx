import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientOption } from "@/domain/client-search";
import { freeLine, type QuoteLineDraft } from "@/domain/quote-line";

import { QuoteForm, type QuoteFormValues } from "./quote-form";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  status: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/server/quotes/actions", () => ({
  saveQuote: (...a: unknown[]) => mocks.save(...a),
  changeQuoteStatus: (...a: unknown[]) => mocks.status(...a),
}));
vi.mock("@/server/quotes/catalog-actions", () => ({
  searchCatalog: vi.fn(),
  getCatalogProduct: vi.fn(),
}));
vi.mock("@/server/clients/search-actions", () => ({
  searchClients: vi.fn(),
  importShopifyCustomer: vi.fn(),
}));
vi.mock("@/server/clients/actions", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const ana: ClientOption = {
  source: "local",
  kind: "persona",
  clientId: "33333333-3333-4333-8333-333333333333",
  name: "Ana Pérez",
  documentType: "dni",
  documentNumber: "45678912",
  phone: null,
  email: null,
  shopifyCustomerId: null,
};

const line = (key: string, patch: Partial<QuoteLineDraft>): QuoteLineDraft => ({
  ...freeLine(key),
  title: "Producto",
  ...patch,
});

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "22222222-2222-4222-8222-222222222222";

const values = (patch: Partial<QuoteFormValues> = {}): QuoteFormValues => ({
  client: ana,
  validityDays: "15",
  pricesIncludeIgv: "si",
  notes: "",
  terms: "Pago al contado.",
  lines: [
    line(KEY_1, { title: "Anillo", quantity: "2", unitPrice: "150.00" }),
    line(KEY_2, { title: "Aretes", quantity: "3", unitPrice: "180" }),
  ],
  ...patch,
});

const lineGroup = (n: number) =>
  screen.getByRole("group", { name: new RegExp(`^Línea ${n}:`) });

describe("QuoteForm", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.save.mockResolvedValue({ ok: true, id: "q1" });
    mocks.status.mockResolvedValue({ ok: true });
  });

  it("recalcula los totales en vivo al editar las líneas", async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values()} />);
    expect(screen.getByTestId("subtotal")).toHaveTextContent("S/ 840.00");
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 840.00");
    expect(screen.queryByTestId("descuentos")).not.toBeInTheDocument();

    const cantidad = within(lineGroup(1)).getByLabelText("Cantidad");
    await user.clear(cantidad);
    await user.type(cantidad, "10");
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 2,040.00");

    // Descuento de S/ 40 en la segunda línea.
    await user.click(within(lineGroup(2)).getByLabelText("Descuento"));
    await user.click(screen.getByRole("option", { name: "Monto (S/)" }));
    await user.type(
      within(lineGroup(2)).getByLabelText("Descuento (S/)"),
      "40",
    );
    expect(screen.getByTestId("descuentos")).toHaveTextContent("− S/ 40.00");
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 2,000.00");
    // IGV incluido: 2000 − 2000 / 1.18
    expect(screen.getByText(/IGV S\/ 305\.08/)).toBeInTheDocument();

    // Un valor inválido cuenta como 0 mientras se corrige.
    await user.clear(
      within(lineGroup(1)).getByLabelText("Precio unitario (S/)"),
    );
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 500.00");
  });

  it("pregunta si el precio incluye IGV y lo suma si no (P13)", async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values({ pricesIncludeIgv: "" })} />);
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(
      screen.getByText("Indica si el precio incluye IGV"),
    ).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText(/No, se suma el IGV/));
    // 840.00 sin IGV: 300.00 → 354.00 y 540.00 → 637.20
    expect(screen.getByTestId("igv")).toHaveTextContent("+ S/ 151.20");
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 991.20");
    expect(screen.queryByText("Indica si el precio incluye IGV")).toBeNull();
  });

  it("muestra la fecha de vencimiento según la vigencia", async () => {
    render(<QuoteForm initial={values()} />);
    expect(
      screen.getByText(/Si se emite hoy, vence el \d{2}\/\d{2}\/\d{4}\./),
    ).toBeInTheDocument();
  });

  it("valida antes de guardar: cliente, líneas, cantidad y precio", async () => {
    const user = userEvent.setup();
    render(
      <QuoteForm
        initial={values({
          client: null,
          lines: [line(KEY_1, { quantity: "0", unitPrice: "-1" })],
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(screen.getByText("Elige un cliente")).toBeInTheDocument();
    expect(
      screen.getByText(
        "La cantidad debe ser un entero mayor que 0 (hasta 100 000)",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingresa un precio válido (0 o más, hasta 2 decimales)"),
    ).toBeInTheDocument();
    expect(within(lineGroup(1)).getByLabelText("Cantidad")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Revisa los datos marcados.");

    // Sin líneas.
    await user.click(screen.getByRole("button", { name: "Quitar línea 1" }));
    expect(screen.getByText("Agrega al menos un producto")).toBeInTheDocument();
  });

  it("guarda un borrador nuevo y abre su detalle", async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values()} />);
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/cotizaciones/q1"),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        clientId: ana.source === "local" ? ana.clientId : "",
        contactId: null,
        terms: "Pago al contado.",
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith("Borrador guardado.");
  });

  it("al emitir guarda primero y luego cambia el estado", async () => {
    const user = userEvent.setup();
    render(<QuoteForm quoteId="q1" initial={values()} />);
    await user.click(screen.getByRole("button", { name: "Emitir" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith("q1", expect.anything());
    expect(mocks.status).toHaveBeenCalledWith("q1", "emitida");
    expect(mocks.success).toHaveBeenCalledWith("Cotización emitida.");
  });

  it("una cotización emitida se muestra sin edición, con 'Atención:' del contacto", () => {
    render(
      <QuoteForm
        quoteId="q1"
        readOnly
        issueDate="2026-10-04"
        initial={values({
          client: {
            source: "local",
            kind: "contacto",
            clientId: ana.source === "local" ? ana.clientId : "",
            contactId: "k1",
            name: "Luis Rojas",
            companyName: "Andina S.A.C.",
            phone: null,
            email: "luis@andina.pe",
            shopifyCustomerId: null,
          },
        })}
      />,
    );
    expect(screen.getByTestId("cliente-cotizacion")).toHaveTextContent(
      "Andina S.A.C.Atención: Luis Rojas",
    );
    expect(
      screen.getByText("Emitida el 04/10/2026; vigente hasta el 19/10/2026."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar borrador" }),
    ).not.toBeInTheDocument();
    expect(within(lineGroup(1)).getByLabelText("Cantidad")).toBeDisabled();
  });
});
