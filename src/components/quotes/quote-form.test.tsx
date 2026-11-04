import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientOption } from "@/domain/client-search";
import { freeLine, type QuoteLineDraft } from "@/domain/quote-line";

import { QuoteForm, type QuoteFormValues } from "./quote-form";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  status: vi.fn(),
  issuer: vi.fn(),
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
  setQuoteIssuer: (...a: unknown[]) => mocks.issuer(...a),
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
  paymentCondition: "contado",
  creditDays: "30",
  issuerId: null,
  deliveryDays: "30",
  applyIgv: true,
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
    render(<QuoteForm initial={values({ applyIgv: false })} />);
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

    // Un valor inválido cuenta como 0 mientras se corrige.
    await user.clear(
      within(lineGroup(1)).getByLabelText("Precio unitario (S/)"),
    );
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 500.00");
  });

  it('con "Sumar IGV" marcado suma el 18 % de subtotal − descuentos', async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values()} />);
    const igv = screen.getByRole("checkbox", { name: "Sumar IGV (18 %)" });
    expect(igv).toBeChecked();
    // 840.00 × 18 % = 151.20.
    expect(screen.getByTestId("subtotal")).toHaveTextContent("S/ 840.00");
    expect(screen.getByTestId("igv")).toHaveTextContent("S/ 151.20");
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 991.20");

    // Descuento de S/ 40: IGV sobre 800.00 = 144.00.
    await user.click(within(lineGroup(2)).getByLabelText("Descuento"));
    await user.click(screen.getByRole("option", { name: "Monto (S/)" }));
    await user.type(
      within(lineGroup(2)).getByLabelText("Descuento (S/)"),
      "40",
    );
    expect(screen.getByTestId("igv")).toHaveTextContent("S/ 144.00");
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 944.00");

    // Al desmarcarla no hay fila de IGV y el total es subtotal − descuentos.
    await user.click(igv);
    expect(screen.queryByTestId("igv")).not.toBeInTheDocument();
    expect(screen.getByTestId("total")).toHaveTextContent("S/ 800.00");
  });

  it("envía la casilla del IGV al guardar", async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values()} />);
    await user.click(
      screen.getByRole("checkbox", { name: "Sumar IGV (18 %)" }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ applyIgv: false }),
    );
  });

  it("emitida: la casilla del IGV no se puede cambiar", () => {
    render(<QuoteForm initial={values()} readOnly />);
    expect(
      screen.getByRole("checkbox", { name: "Sumar IGV (18 %)" }),
    ).toBeDisabled();
    expect(screen.getByTestId("igv")).toHaveTextContent("S/ 151.20");
  });

  it("muestra la fecha de vencimiento según la vigencia", async () => {
    render(<QuoteForm initial={values()} />);
    expect(
      screen.getByText(/Si se emite hoy, vence el \d{2}\/\d{2}\/\d{4}\./),
    ).toBeInTheDocument();
  });

  it("condición de pago y tiempo de entrega se envían al guardar", async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values()} />);
    const condicion = screen.getByLabelText("Condición de pago");
    expect(condicion).toHaveTextContent("Al contado");
    await user.click(condicion);
    for (const name of ["Al contado", "Al crédito", "A cuenta"])
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Al crédito" }));
    expect(condicion).toHaveTextContent("Al crédito");
    const credito = screen.getByLabelText("Días de crédito");
    expect(credito).toHaveValue("30");
    await user.clear(credito);
    await user.type(credito, "60");

    const entrega = screen.getByLabelText("Tiempo de entrega (días hábiles)");
    expect(entrega).toHaveValue("30");
    await user.clear(entrega);
    await user.type(entrega, "45");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        paymentCondition: "credito",
        creditDays: "60",
        deliveryDays: "45",
      }),
    );
  });

  it("valida el tiempo de entrega", async () => {
    const user = userEvent.setup();
    render(<QuoteForm initial={values({ deliveryDays: "0" })} />);
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(
      screen.getByLabelText("Tiempo de entrega (días hábiles)"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByLabelText("Tiempo de entrega (días hábiles)"),
    ).toHaveAccessibleDescription(/tiempo de entrega/i);
    expect(mocks.save).not.toHaveBeenCalled();
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
    expect(screen.getByLabelText("Condición de pago")).toBeDisabled();
    expect(
      screen.getByLabelText("Tiempo de entrega (días hábiles)"),
    ).toBeDisabled();
  });

  describe("sucursal", () => {
    const issuers = [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "PEREDA SAC",
        legalName: "PEREDA SAC",
        documentType: "ruc" as const,
        documentNumber: "20557169866",
        bankName: "Banco de Crédito (BCP)",
        accountLabel: "CTA CTE soles",
        accountNumber: "1942229780029",
        cci: "00219400222978002998",
        active: true,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "CARMEN",
        legalName: "Regina Pereda Luque",
        documentType: "dni" as const,
        documentNumber: "07863594",
        bankName: "Banco de Crédito (BCP)",
        accountLabel: "CTA AHORRO soles",
        accountNumber: "19493993660088",
        cci: "00219419399366008899",
        active: true,
      },
    ];

    it("en una nueva, se elige y se envía al guardar", async () => {
      const user = userEvent.setup();
      render(<QuoteForm initial={values()} issuers={issuers} />);
      await user.click(screen.getByLabelText("Sucursal que emite"));
      await user.click(
        screen.getByRole("option", { name: "PEREDA SAC · RUC 20557169866" }),
      );
      expect(screen.getByTestId("sucursal-pdf")).toHaveTextContent(
        "RUC: 20557169866",
      );
      expect(mocks.issuer).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("button", { name: "Guardar borrador" }),
      );
      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.save).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ issuerId: issuers[0]!.id }),
      );
    });

    it("en una emitida (solo lectura) se cambia y se guarda al momento", async () => {
      mocks.issuer.mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(
        <QuoteForm
          quoteId="q1"
          readOnly
          initial={values({ issuerId: issuers[0]!.id })}
          issuers={issuers}
        />,
      );
      await user.click(screen.getByLabelText("Sucursal que emite"));
      await user.click(
        screen.getByRole("option", { name: "CARMEN · DNI 07863594" }),
      );
      await waitFor(() =>
        expect(mocks.issuer).toHaveBeenCalledWith("q1", issuers[1]!.id),
      );
      expect(mocks.success).toHaveBeenCalledWith("Sucursal guardada.");
      // Con DNI solo se muestra la cuenta.
      expect(screen.getByTestId("sucursal-pdf")).not.toHaveTextContent(
        "07863594",
      );
    });
  });
});
