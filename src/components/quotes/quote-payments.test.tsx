import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuotePayments } from "@/server/quotes/queries";

const actions = vi.hoisted(() => ({
  registerQuotePayment: vi.fn(),
  setQuotePaymentInvoice: vi.fn(),
  deleteQuotePayment: vi.fn(),
  setQuoteTracking: vi.fn(),
}));
vi.mock("@/server/quotes/payment-actions", () => actions);
vi.mock("@/server/quotes/actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const { QuotePaymentsSection } = await import("./quote-payments");
const { QuoteTrackingControls } = await import("./quote-tracking");

const METHODS = [
  { id: "00000000-0000-4000-8000-000000000002", name: "Yape" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Efectivo" },
];

const data = (overrides: Partial<QuotePayments> = {}): QuotePayments => ({
  payments: [
    {
      id: "p1",
      amountCents: 10000,
      methodName: "Yape",
      paidOn: "2026-11-10",
      invoiceNumber: null,
      createdByName: "Ventas",
      createdAt: "2026-11-10T15:00:00Z",
    },
    {
      id: "p2",
      amountCents: 5000,
      methodName: "Efectivo",
      paidOn: "2026-11-11",
      invoiceNumber: "F001-9",
      createdByName: "Ventas",
      createdAt: "2026-11-11T15:00:00Z",
    },
  ],
  paidCents: 15000,
  balanceCents: 5000,
  status: "parcial",
  ...overrides,
});

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe("QuotePaymentsSection", () => {
  const render_ = (
    props: Partial<Parameters<typeof QuotePaymentsSection>[0]> = {},
  ) =>
    render(
      <QuotePaymentsSection
        quoteId="q1"
        totalCents={20000}
        data={data()}
        methods={METHODS}
        canRegister
        canDelete={false}
        {...props}
      />,
    );

  it("muestra total, pagado, saldo y el estado de pago", () => {
    render_();
    expect(screen.getByTestId("monto-total")).toHaveTextContent("S/ 200.00");
    expect(screen.getByTestId("monto-pagado")).toHaveTextContent("S/ 150.00");
    expect(screen.getByTestId("monto-saldo")).toHaveTextContent("S/ 50.00");
    expect(
      document.querySelector("[data-payment-status=parcial]"),
    ).not.toBeNull();
  });

  it("lista los pagos con su N.º de factura o «Sin factura»", () => {
    render_();
    const rows = screen.getAllByTestId("pago-cotizacion");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Sin factura");
    expect(rows[1]).toHaveTextContent("F001-9");
  });

  it("asigna el número de factura de un pago", async () => {
    const user = userEvent.setup();
    actions.setQuotePaymentInvoice.mockResolvedValue({ ok: true });
    render_();
    const row = screen.getAllByTestId("pago-cotizacion")[0]!;
    await user.click(
      within(row).getByRole("button", { name: "Asignar factura" }),
    );
    await user.type(within(row).getByLabelText("Número de factura"), "F001-55");
    await user.click(
      within(row).getByRole("button", { name: "Guardar factura" }),
    );
    expect(actions.setQuotePaymentInvoice).toHaveBeenCalledWith(
      "q1",
      "p1",
      "F001-55",
    );
  });

  it("sin permiso de eliminar no ofrece el botón; el admin sí", () => {
    const { unmount } = render_();
    expect(
      screen.queryByRole("button", { name: /Eliminar el pago/ }),
    ).toBeNull();
    unmount();
    render_({ canDelete: true });
    expect(
      screen.getAllByRole("button", { name: /Eliminar el pago/ }),
    ).toHaveLength(2);
  });

  it("no ofrece registrar pagos si la cotización no está aceptada ni facturada", () => {
    render_({ canRegister: false });
    expect(screen.queryByRole("button", { name: "Registrar pago" })).toBeNull();
  });

  it("con el saldo en cero no se puede registrar otro pago", () => {
    render_({ data: data({ balanceCents: 0, status: "pagado" }) });
    expect(
      screen.getByRole("button", { name: "Registrar pago" }),
    ).toBeDisabled();
  });

  it("registra un pago con método, monto y factura", async () => {
    const user = userEvent.setup();
    actions.registerQuotePayment.mockResolvedValue({ ok: true });
    render_();
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Monto (S/)")).toHaveValue("50.00");
    await user.click(within(dialog).getByRole("combobox", { name: "Método" }));
    await user.click(await screen.findByRole("option", { name: "Yape" }));
    await user.type(
      within(dialog).getByLabelText("N.º de factura (opcional)"),
      "F001-1",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(actions.registerQuotePayment).toHaveBeenCalledWith(
      "q1",
      expect.objectContaining({
        rows: [{ methodId: METHODS[0]!.id, amountCents: 5000 }],
        invoiceNumber: "F001-1",
      }),
    );
  });

  it("no deja pasar del saldo", async () => {
    const user = userEvent.setup();
    render_();
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Método" }));
    await user.click(await screen.findByRole("option", { name: "Yape" }));
    const amount = within(dialog).getByLabelText("Monto (S/)");
    await user.clear(amount);
    await user.type(amount, "80");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(dialog).toHaveTextContent("supera el saldo pendiente");
    expect(actions.registerQuotePayment).not.toHaveBeenCalled();
  });
});

describe("QuoteTrackingControls", () => {
  it("cambia la ubicación al elegirla", async () => {
    const user = userEvent.setup();
    actions.setQuoteTracking.mockResolvedValue({ ok: true });
    render(
      <QuoteTrackingControls
        quoteId="q1"
        workLocation={null}
        workshopId={null}
        workshopName={null}
        workshops={[{ id: "w1", name: "Taller Uno" }]}
        canAssignWorkshop={false}
      />,
    );
    await user.click(
      screen.getByRole("combobox", { name: "Ubicación del trabajo" }),
    );
    await user.click(await screen.findByRole("option", { name: "En tienda" }));
    expect(actions.setQuoteTracking).toHaveBeenCalledWith("q1", {
      workLocation: "en_tienda",
    });
  });

  it("sin permiso el taller se muestra como texto", () => {
    render(
      <QuoteTrackingControls
        quoteId="q1"
        workLocation="en_taller"
        workshopId="w1"
        workshopName="Taller Uno"
        workshops={[]}
        canAssignWorkshop={false}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Taller" })).toBeNull();
    expect(screen.getByText("Taller Uno")).toBeInTheDocument();
  });

  it("con permiso asigna el taller", async () => {
    const user = userEvent.setup();
    actions.setQuoteTracking.mockResolvedValue({ ok: true });
    render(
      <QuoteTrackingControls
        quoteId="q1"
        workLocation={null}
        workshopId={null}
        workshopName={null}
        workshops={[{ id: "w1", name: "Taller Uno" }]}
        canAssignWorkshop
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Taller" }));
    await user.click(await screen.findByRole("option", { name: "Taller Uno" }));
    expect(actions.setQuoteTracking).toHaveBeenCalledWith("q1", {
      workshopId: "w1",
    });
  });
});
