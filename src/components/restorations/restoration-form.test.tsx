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

/** Por defecto como admin, que asigna el precio de venta (D58) y el taller (D60). */
function renderForm(
  mode?: RestorationFormMode,
  canSetPrice = true,
  canAssignWorkshop = canSetPrice,
) {
  return render(
    <RestorationForm
      mode={mode}
      canSetPrice={canSetPrice}
      canAssignWorkshop={canAssignWorkshop}
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
      paymentMethods={[
        { id: "00000000-0000-0000-0000-0000000000b1", name: "Yape" },
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

  it("no suma IGV: el total son los precios tal como se escribieron", () => {
    expect(liveTotal([{ price: "100" }, { price: "50.50" }])).toBe(15050);
  });

  it("sin precios todavía el total es 0 (D59)", () => {
    expect(liveTotal([{ price: "" }, { price: "" }])).toBe(0);
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
    expect(deposit).toHaveTextContent("—");

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "A cuenta" }));
    expect(deposit).toHaveTextContent("S/ 0.00");
    await user.type(screen.getByLabelText("Adelanto (S/) (opcional)"), "50");
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

  it("no pregunta por el IGV ni lo suma al total", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    expect(container).not.toHaveTextContent(/IGV/i);
    expect(screen.queryByRole("radio")).toBeNull();
    const total = screen.getByTestId("total-en-vivo");
    expect(total).toHaveTextContent("S/ 0.00");

    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Precio (S/)"),
      "100",
    );
    expect(total).toHaveTextContent("S/ 100.00");
  });

  it("ordena los campos de la pieza: descripción y notas primero, luego servicio, material, peso, medida y precio", () => {
    renderForm();
    const card = within(screen.getByTestId("pieza-1"));
    const labels = card
      .getAllByText(
        /^(Servicio|Material|Peso \(g\)|Medida|Precio \(S\/\)|Descripción|Notas de la pieza|Taller|Urgente)$/,
      )
      .map((el) => el.textContent);
    expect(labels).toEqual([
      "Descripción",
      "Notas de la pieza",
      "Servicio",
      "Material",
      "Peso (g)",
      "Medida",
      "Precio (S/)",
      "Taller",
      "Urgente",
    ]);
    // La descripción va antes que el servicio en el DOM (orden de tabulación).
    expect(
      card
        .getByLabelText("Descripción")
        .compareDocumentPosition(card.getByLabelText("Servicio")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByLabelText("Notas generales")).toBeInTheDocument();
  });

  it("no pregunta si la pieza ya está en tienda: en oficina siempre lo está (P48)", () => {
    renderForm();
    expect(
      within(screen.getByTestId("pieza-1")).queryByLabelText(
        "La pieza ya está en tienda",
      ),
    ).toBeNull();
  });

  it("el precio de venta no sale del servicio: queda «Por definir» (D58)", async () => {
    const user = userEvent.setup();
    renderForm();
    const card = within(screen.getByTestId("pieza-1"));
    await user.click(card.getByLabelText("Servicio"));
    await user.click(screen.getByRole("option", { name: "Limpieza" }));
    expect(card.getByLabelText("Precio (S/)")).toHaveValue("");
    expect(card.getByLabelText("Precio (S/)")).toHaveAttribute(
      "placeholder",
      "Por definir",
    );
    expect(card.getByTestId("precio-pieza")).toHaveTextContent("Por definir");
  });

  it("sin permiso del taller (ventas) no se elige el taller al registrar (D60)", () => {
    renderForm(undefined, false);
    const card = within(screen.getByTestId("pieza-1"));
    expect(card.queryByLabelText("Taller")).toBeNull();
    expect(card.queryByText("Taller")).toBeNull();
    expect(card.getByLabelText("Urgente")).toBeInTheDocument();
  });

  it("sin ser admin el precio de venta no se edita (D58)", () => {
    renderForm(undefined, false);
    const card = within(screen.getByTestId("pieza-1"));
    expect(card.getByLabelText("Precio (S/)")).toBeDisabled();
    expect(
      card.getByText("Solo el administrador asigna el precio de venta."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("total-en-vivo")).toHaveTextContent("S/ 0.00");
  });

  it("al quitar la casilla de WhatsApp, sin ser admin se borran los precios cotizados", async () => {
    const user = userEvent.setup();
    renderForm(undefined, false);
    const whatsapp = screen.getByLabelText(/El pedido vino por WhatsApp/);
    await user.click(whatsapp);
    const card = within(screen.getByTestId("pieza-1"));
    expect(card.getByLabelText("Precio (S/)")).toBeEnabled();
    await user.type(card.getByLabelText("Precio (S/)"), "100");
    await user.click(whatsapp);
    expect(card.getByLabelText("Precio (S/)")).toHaveValue("");
    expect(card.getByLabelText("Precio (S/)")).toBeDisabled();
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
    // El servicio es obligatorio (D59); el precio de venta, opcional (D58).
    expect(first.getByText("Elige el servicio")).toBeVisible();
    expect(first.queryByText("Ingresa el precio")).toBeNull();
    expect(
      second.getByText("Describe la pieza (qué es y cómo está)"),
    ).toBeVisible();
    expect(second.getByText("Elige el servicio")).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("el adelanto en soles solo se pide en A cuenta", async () => {
    const user = userEvent.setup();
    renderForm();
    // Por defecto el tipo de pago está por definir: sin adelanto ni %.
    expect(screen.getByLabelText("Tipo de pago")).toHaveTextContent(
      "Por definir",
    );
    expect(screen.queryByLabelText("Adelanto (S/) (opcional)")).toBeNull();
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("—");
    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Precio (S/)"),
      "80",
    );

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al crédito" }));
    expect(screen.queryByLabelText("Adelanto (S/) (opcional)")).toBeNull();
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("S/ 0.00");

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al contado" }));
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent(
      "S/ 80.00",
    );

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "A cuenta" }));
    const amount = screen.getByLabelText("Adelanto (S/) (opcional)");
    expect(amount).toHaveValue("");
    // Vacío sugiere el % por defecto de la configuración.
    expect(screen.getByTestId("adelanto-porcentaje")).toHaveTextContent(
      "Sugerido (50 %): S/ 40.00",
    );
    await user.type(amount, "20");
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent(
      "S/ 20.00",
    );
    expect(screen.getByTestId("adelanto-porcentaje")).toHaveTextContent(
      "25 % del total · Saldo: S/ 60.00",
    );
    await user.clear(amount);
    await user.type(amount, "abc");
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("—");

    // El adelanto es opcional: vacío = sin adelanto.
    await user.clear(amount);
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("S/ 0.00");
  });

  it("con adelanto pide el método con que se pagó: se registra como pago", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "A cuenta" }));
    // Sin adelanto no hay nada que cobrar.
    expect(screen.queryByLabelText("Método del adelanto")).toBeNull();
    await user.type(screen.getByLabelText("Adelanto (S/) (opcional)"), "100");
    expect(screen.getByLabelText("Método del adelanto")).toBeInTheDocument();
    expect(
      screen.getByText("El adelanto se registra como pago al guardar."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Registrar restauración" }),
    );
    expect(
      await screen.findByText("Elige el método con que se pagó el adelanto"),
    ).toBeVisible();
    await user.click(screen.getByLabelText("Método del adelanto"));
    await user.click(await screen.findByRole("option", { name: "Yape" }));
    expect(
      screen.queryByText("Elige el método con que se pagó el adelanto"),
    ).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Adelanto (S/) (opcional)"));
    expect(screen.queryByLabelText("Método del adelanto")).toBeNull();
  });

  it("muestra errores claros del adelanto mientras se escribe", async () => {
    mocks.create.mockResolvedValue({ ok: true, id: "r1", code: "RES-00001" });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "A cuenta" }));
    const amount = screen.getByLabelText("Adelanto (S/) (opcional)");

    // Sin precios todavía: se guarda el monto y el % se calcula después.
    await user.type(amount, "300");
    expect(screen.getByTestId("adelanto-porcentaje")).toHaveTextContent(
      "Aún no hay precios: el % y el saldo se calculan cuando se asignen.",
    );

    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Precio (S/)"),
      "100",
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar restauración" }),
    );
    expect(
      await screen.findByText(
        "El adelanto no puede ser mayor que el total (S/ 100.00)",
      ),
    ).toBeVisible();

    await user.clear(amount);
    await user.type(amount, "-5");
    expect(
      await screen.findByText("El adelanto no puede ser negativo"),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
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
    materials: [],
    service: { id: null, name: "Limpieza" },
    weight: "",
    price,
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
    expect(within(piece).getByLabelText("Taller")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/El pedido vino por WhatsApp/));
    expect(within(piece).queryByLabelText("Taller")).toBeNull();
    expect(screen.getByText("Cliente (opcional)")).toBeInTheDocument();
    // La cotización no lleva pago.
    expect(screen.queryByLabelText("Tipo de pago")).toBeNull();
    expect(screen.queryByTestId("adelanto-en-vivo")).toBeNull();

    await user.type(screen.getByLabelText("Nombre (opcional)"), "Ana Pérez");
    await user.type(within(piece).getByLabelText("Descripción"), "Fuente");
    await user.click(within(piece).getByLabelText("Servicio"));
    await user.click(screen.getByRole("option", { name: "Limpieza" }));
    await user.type(within(piece).getByLabelText("Precio (S/)"), "100");
    expect(screen.getByTestId("total-en-vivo")).toHaveTextContent("S/ 100.00");
    await user.click(
      screen.getByRole("button", { name: "Registrar cotización" }),
    );

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "",
        customerName: "Ana Pérez",
        paymentType: "sin_definir",
        depositPercent: "",
        depositAmount: "",
      }),
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
    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText(
        "Nota de la consulta (obligatoria)",
      ),
      "Consultar al taller",
    );
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
            initialStatus: "en_consulta",
            statusNote: "Consultar al taller",
          }),
        ],
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/restauraciones/r1?registrada=1");
  });

  it("si el adelanto no se pudo registrar como pago, el detalle lo avisa", async () => {
    mocks.copy.mockResolvedValue({
      ok: true,
      id: "r1",
      code: "RES-00010",
      warning: "No se registró el adelanto.",
    });
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
    await user.click(screen.getByLabelText("Pedir Fuente"));
    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText(
        "Nota de la consulta (obligatoria)",
      ),
      "Consultar al taller",
    );
    await user.click(
      screen.getByRole("button", { name: "Crear restauración" }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/restauraciones/r1?registrada=1&adelanto=pendiente",
    );
  });
});

describe("RestorationForm · estado inicial al copiar (P49)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  const linkedQuote: QuoteForForm = {
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
  };

  it("cada pieza nace en Consulta y la nota es obligatoria", async () => {
    const user = userEvent.setup();
    renderForm({ kind: "copia", quote: linkedQuote });
    const piece = screen.getByTestId("pieza-1");
    expect(within(piece).getByLabelText("Estado inicial")).toHaveTextContent(
      "Consulta",
    );
    expect(within(piece).getByText("Pasa a Consulta")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Crear restauración" }),
    );
    expect(
      screen.getAllByText("Escribe una nota para la consulta"),
    ).toHaveLength(2);
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("solo ofrece Consulta o Aprobada, y Aprobada no pide nota", async () => {
    mocks.copy.mockResolvedValue({ ok: true, id: "r1", code: "RES-00010" });
    const user = userEvent.setup();
    renderForm({ kind: "copia", quote: linkedQuote });
    const fuente = screen.getByTestId("pieza-1");
    const jarra = screen.getByTestId("pieza-2");

    await user.click(within(fuente).getByLabelText("Estado inicial"));
    // Espera respuesta cliente se alcanza después, desde Consulta.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Consulta",
      "Aprobada",
    ]);
    await user.click(screen.getByRole("option", { name: "Aprobada" }));
    expect(
      within(fuente).queryByLabelText("Nota de la consulta (obligatoria)"),
    ).toBeNull();

    await user.type(
      within(jarra).getByLabelText("Nota de la consulta (obligatoria)"),
      "Preguntar si quiere grabado",
    );
    await user.click(
      screen.getByRole("button", { name: "Crear restauración" }),
    );
    expect(mocks.copy).toHaveBeenCalledWith(
      QUOTE.id,
      expect.objectContaining({
        pieces: [
          expect.objectContaining({
            description: "Fuente",
            initialStatus: "aprobada",
          }),
          expect.objectContaining({
            description: "Jarra",
            initialStatus: "en_consulta",
            statusNote: "Preguntar si quiere grabado",
          }),
        ],
      }),
    );
  });

  it("sin ser admin conserva el precio cotizado y las piezas nuevas quedan sin precio (D58)", async () => {
    const user = userEvent.setup();
    renderForm({ kind: "copia", quote: linkedQuote }, false);
    const fuente = within(screen.getByTestId("pieza-1"));
    expect(fuente.getByLabelText("Precio (S/)")).toHaveValue("100.00");
    expect(fuente.getByLabelText("Precio (S/)")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Duplicar pieza 1" }));
    expect(
      within(screen.getByTestId("pieza-2")).getByLabelText("Precio (S/)"),
    ).toHaveValue("");
    expect(screen.getByTestId("total-en-vivo")).toHaveTextContent("S/ 160.00");
  });

  it("las piezas nuevas también eligen estado inicial", async () => {
    const user = userEvent.setup();
    renderForm({ kind: "copia", quote: linkedQuote });
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    // Sin precio pasa a Consulta sola; con precio se elige el estado.
    const card = within(screen.getByTestId("pieza-3"));
    expect(card.getByTestId("pasa-a-consulta")).toBeVisible();
    await user.type(card.getByLabelText("Precio (S/)"), "50");
    expect(card.getByLabelText("Estado inicial")).toHaveTextContent("Consulta");
  });

  it.each([
    ["admin", true],
    ["ventas", false],
  ])(
    "crea la restauración sin precio desde una pieza Por definir (%s)",
    async (_role, canSetPrice) => {
      mocks.copy.mockResolvedValue({ ok: true, id: "r1", code: "RES-00010" });
      const user = userEvent.setup();
      const unpriced = quoteItem(
        "00000000-0000-0000-0000-0000000000d4",
        1,
        "Bandeja",
        "",
      );
      renderForm(
        {
          kind: "copia",
          quote: {
            ...linkedQuote,
            items: [{ ...unpriced, priceLabel: "Por definir" }],
          },
        },
        canSetPrice,
      );
      const item = screen
        .getByRole("checkbox", { name: "Pedir Bandeja" })
        .closest("li")!;
      expect(
        within(item as HTMLElement).getByText("Por definir"),
      ).toBeVisible();
      const card = within(screen.getByTestId("pieza-1"));
      expect(card.getByLabelText("Precio (S/)")).toHaveValue("");
      // Sin precio no pide estado inicial ni nota: pasa a Consulta sola.
      expect(card.getByTestId("pasa-a-consulta")).toBeVisible();
      expect(card.queryByLabelText("Estado inicial")).toBeNull();

      await user.click(
        screen.getByRole("button", { name: "Crear restauración" }),
      );
      expect(mocks.copy).toHaveBeenCalledWith(
        QUOTE.id,
        expect.objectContaining({
          pieces: [
            expect.objectContaining({
              description: "Bandeja",
              price: "",
              quoteItemId: unpriced.id,
            }),
          ],
        }),
      );
      expect(mocks.push).toHaveBeenCalledWith(
        "/restauraciones/r1?registrada=1",
      );
    },
  );

  it("el registro en oficina no muestra el estado inicial", () => {
    renderForm();
    expect(
      within(screen.getByTestId("pieza-1")).queryByLabelText("Estado inicial"),
    ).toBeNull();
  });
});
