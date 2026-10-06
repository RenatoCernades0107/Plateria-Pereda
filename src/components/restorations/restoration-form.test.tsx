import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  liveTotal,
  RestorationForm,
  type QuoteForForm,
  type RestorationFormMode,
} from "./restoration-form";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  copy: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/server/restorations/actions", () => ({
  createRestoration: (...a: unknown[]) => mocks.create(...a),
  listClientContacts: async () => [],
}));
vi.mock("@/server/whatsapp-quotes/actions", () => ({
  createWhatsappQuote: (...a: unknown[]) => mocks.createQuote(...a),
  updateWhatsappQuote: (...a: unknown[]) => mocks.updateQuote(...a),
  createRestorationFromQuote: (...a: unknown[]) => mocks.copy(...a),
}));
vi.mock("@/server/clients/search-actions", () => ({
  searchClients: vi.fn(),
  importShopifyCustomer: vi.fn(),
}));
vi.mock("@/server/clients/actions", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => "/restauraciones/nueva",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderForm(mode?: RestorationFormMode) {
  return render(
    <RestorationForm
      mode={mode}
      defaultDepositPercent={50}
      workshops={[{ id: "w1", name: "Taller Central" }]}
      materials={[]}
      services={[
        {
          id: "00000000-0000-0000-0000-0000000000a1",
          name: "Limpieza",
          price: 40,
        },
      ]}
    />,
  );
}

describe("liveTotal", () => {
  it("suma los precios válidos y cuenta 0 los vacíos o mal escritos", () => {
    expect(
      liveTotal([
        { price: "0.10" },
        { price: "0.20" },
        { price: "" },
        { price: "abc" },
      ]),
    ).toBe(30);
  });
});

describe("RestorationForm", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  it("actualiza el total y el adelanto al agregar, editar y quitar piezas", async () => {
    const user = userEvent.setup();
    renderForm();
    const total = screen.getByTestId("total-en-vivo");
    const deposit = screen.getByTestId("adelanto-en-vivo");

    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Precio (S/)"),
      "100",
    );
    expect(total).toHaveTextContent("S/ 100.00");
    expect(deposit).toHaveTextContent("S/ 50.00");

    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    await user.type(
      within(screen.getByTestId("pieza-2")).getByLabelText("Precio (S/)"),
      "25.50",
    );
    expect(total).toHaveTextContent("S/ 125.50");

    await user.click(screen.getByRole("button", { name: "Duplicar pieza 2" }));
    expect(total).toHaveTextContent("S/ 151.00");

    await user.click(screen.getByRole("button", { name: "Quitar pieza 1" }));
    expect(total).toHaveTextContent("S/ 51.00");
  });

  it("la pieza viene marcada como ya en tienda (P20)", () => {
    renderForm();
    expect(
      within(screen.getByTestId("pieza-1")).getByLabelText(
        "La pieza ya está en tienda",
      ),
    ).toBeChecked();
  });

  it("propone el precio sugerido del servicio elegido del catálogo", async () => {
    const user = userEvent.setup();
    renderForm();
    const card = within(screen.getByTestId("pieza-1"));
    await user.type(card.getByLabelText("Servicio"), "Limpieza");
    expect(card.getByLabelText("Precio (S/)")).toHaveValue("40.00");
  });

  it("muestra los errores en cada pieza y no envía datos incompletos", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Descripción"),
      "Fuente",
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar restauración" }),
    );

    expect(await screen.findByText("Elige un cliente")).toBeVisible();
    const first = within(screen.getByTestId("pieza-1"));
    const second = within(screen.getByTestId("pieza-2"));
    expect(
      first.queryByText("Describe la pieza (qué es y cómo está)"),
    ).toBeNull();
    expect(first.getByText("Ingresa el precio")).toBeVisible();
    expect(
      second.getByText("Describe la pieza (qué es y cómo está)"),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("el % de adelanto solo se pide en A cuenta", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText("Adelanto (%)")).toHaveValue("50");
    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Precio (S/)"),
      "80",
    );

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al crédito" }));
    expect(screen.queryByLabelText("Adelanto (%)")).toBeNull();
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("S/ 0.00");

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al contado" }));
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent(
      "S/ 80.00",
    );

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "A cuenta" }));
    const percent = screen.getByLabelText("Adelanto (%)");
    await user.clear(percent);
    await user.type(percent, "0");
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("—");
  });
});

const quoteItem = (
  id: string,
  number: number,
  description: string,
  price: string,
  orderedIn: string | null = null,
) => ({
  id,
  number,
  priceLabel: `S/ ${price}`,
  orderedIn,
  piece: {
    workshopId: null,
    description,
    measure: "",
    material: { id: null, name: "" },
    service: { id: null, name: "" },
    weight: "",
    price,
    arrived: false,
    urgent: false,
    notes: "",
    quoteItemId: null,
  },
});

const QUOTE: QuoteForForm = {
  id: "00000000-0000-0000-0000-0000000000c1",
  code: "CWA-00001",
  client: null,
  contactId: null,
  customerName: "Ana Pérez",
  customerPhone: "999888777",
  paymentType: "contado",
  depositPercent: null,
  notes: "",
  items: [
    quoteItem("00000000-0000-0000-0000-0000000000d1", 1, "Fuente", "100.00"),
    quoteItem("00000000-0000-0000-0000-0000000000d2", 2, "Jarra", "60.00"),
    quoteItem(
      "00000000-0000-0000-0000-0000000000d3",
      3,
      "Candelabro",
      "40.00",
      "RES-00009",
    ),
  ],
};

describe("RestorationForm · cotización por WhatsApp (P46)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  it("con la casilla marcada el cliente es opcional y se registra una cotización", async () => {
    mocks.createQuote.mockResolvedValue({
      ok: true,
      id: "q1",
      code: "CWA-00001",
    });
    const user = userEvent.setup();
    renderForm();
    const piece = screen.getByTestId("pieza-1");
    expect(
      within(piece).getByLabelText("La pieza ya está en tienda"),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText(/El pedido vino por WhatsApp/));
    expect(
      within(piece).queryByLabelText("La pieza ya está en tienda"),
    ).toBeNull();
    expect(within(piece).queryByLabelText("Taller")).toBeNull();
    expect(screen.getByText("Cliente (opcional)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre (opcional)"), "Ana Pérez");
    await user.type(within(piece).getByLabelText("Descripción"), "Fuente");
    await user.type(within(piece).getByLabelText("Precio (S/)"), "100");
    await user.click(
      screen.getByRole("button", { name: "Registrar cotización" }),
    );

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "", customerName: "Ana Pérez" }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/cotizaciones-whatsapp/q1?registrada=1",
    );
  });

  it("sin la casilla el cliente sigue siendo obligatorio", async () => {
    const user = userEvent.setup();
    renderForm();
    const piece = screen.getByTestId("pieza-1");
    await user.type(within(piece).getByLabelText("Descripción"), "Fuente");
    await user.type(within(piece).getByLabelText("Precio (S/)"), "100");
    await user.click(
      screen.getByRole("button", { name: "Registrar restauración" }),
    );
    expect(screen.getByText("Elige un cliente")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("al copiar propone las piezas pendientes y permite elegir cuáles", async () => {
    mocks.copy.mockResolvedValue({ ok: true, id: "r1", code: "RES-00010" });
    const user = userEvent.setup();
    renderForm({ kind: "copia", quote: QUOTE });

    expect(screen.getByLabelText("Pedir Candelabro")).toBeDisabled();
    expect(screen.getByText("Pedida en RES-00009")).toBeInTheDocument();
    expect(screen.getByTestId("pieza-2")).toBeInTheDocument();
    expect(screen.queryByTestId("pieza-3")).toBeNull();

    await user.click(screen.getByLabelText("Pedir Jarra"));
    expect(screen.queryByTestId("pieza-2")).toBeNull();
    expect(screen.getByTestId("total-en-vivo")).toHaveTextContent("S/ 100.00");

    // El cliente es obligatorio al copiar.
    await user.click(
      screen.getByRole("button", { name: "Crear restauración" }),
    );
    expect(screen.getByText("Elige un cliente")).toBeInTheDocument();
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("con el cliente vinculado copia solo las piezas elegidas", async () => {
    mocks.copy.mockResolvedValue({ ok: true, id: "r1", code: "RES-00010" });
    const user = userEvent.setup();
    renderForm({
      kind: "copia",
      quote: {
        ...QUOTE,
        client: {
          source: "local",
          kind: "persona",
          clientId: "00000000-0000-0000-0000-0000000000e1",
          name: "Ana Pérez",
          documentType: null,
          documentNumber: null,
          phone: null,
          email: null,
          shopifyCustomerId: null,
        },
      },
    });
    expect(screen.getByTestId("cliente-fijo")).toHaveTextContent("Ana Pérez");
    await user.click(screen.getByLabelText("Pedir Fuente"));
    await user.click(
      screen.getByRole("button", { name: "Crear restauración" }),
    );
    expect(mocks.copy).toHaveBeenCalledWith(
      QUOTE.id,
      expect.objectContaining({
        clientId: "00000000-0000-0000-0000-0000000000e1",
        pieces: [
          expect.objectContaining({
            description: "Jarra",
            quoteItemId: "00000000-0000-0000-0000-0000000000d2",
            arrived: false,
          }),
        ],
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/restauraciones/r1?registrada=1");
  });
});
