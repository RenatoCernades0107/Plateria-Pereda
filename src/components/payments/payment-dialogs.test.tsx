import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  registerPayment: vi.fn(),
  refundPayment: vi.fn(),
  approveWithPayment: vi.fn(),
  deliverWithBalance: vi.fn(),
  resyncPayments: vi.fn(),
}));
vi.mock("@/server/payments/actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { RegisterPaymentDialog } = await import("./register-payment-dialog");
const { RefundDialog } = await import("./refund-dialog");
const { ApproveWithPaymentDialog, DeliverWithBalanceDialog } =
  await import("./piece-payment-dialogs");
const { ResyncPaymentsButton } = await import("./resync-payments-button");

const METHODS = [
  { id: "00000000-0000-4000-8000-000000000002", name: "Yape" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Efectivo" },
];

const BRANCHES = [
  { id: "00000000-0000-4000-8000-0000000000b1", name: "PEREDA 4TA - CAJA" },
  { id: "00000000-0000-4000-8000-0000000000b2", name: "RUS CARMEN - VENTAS2" },
];

async function chooseBranch(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole("combobox", { name: "Sucursal" }));
  await user.click(await screen.findByRole("option", { name }));
}

async function chooseMethod(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  index = 0,
) {
  await user.click(screen.getAllByRole("combobox", { name: "Método" })[index]!);
  await user.click(await screen.findByRole("option", { name }));
}

describe("diálogos de pagos (11.2)", () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset();
  });

  it("Registrar pago: propone el monto, valida y reparte en métodos", async () => {
    const user = userEvent.setup();
    actions.registerPayment.mockResolvedValue({ ok: true });
    render(
      <RegisterPaymentDialog
        restorationId="r1"
        balanceCents={40000}
        suggested={{ kind: "adelanto", amount: 20000 }}
        methods={METHODS}
        branches={BRANCHES}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Adelanto pendiente: S/ 200.00");
    expect(within(dialog).getByLabelText("Monto (S/)")).toHaveValue("200.00");

    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(dialog).toHaveTextContent("Elige la sucursal.");
    await chooseBranch(user, "PEREDA 4TA - CAJA");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(dialog).toHaveTextContent("Elige el método de pago.");

    await chooseMethod(user, "Yape");
    await user.click(
      within(dialog).getByRole("button", { name: "Otro método" }),
    );
    await chooseMethod(user, "Efectivo", 1);
    const amounts = within(dialog).getAllByLabelText("Monto (S/)");
    await user.type(amounts[1]!, "250");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(dialog).toHaveTextContent("El monto supera el saldo pendiente");

    await user.click(
      within(dialog).getByRole("button", { name: "Quitar método 2" }),
    );
    actions.registerPayment.mockResolvedValueOnce({ error: "Falló la BD" });
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(await within(dialog).findByText("Falló la BD")).toBeInTheDocument();
    // El error aparece antes de que termine la transición ("Guardando…").
    await user.click(
      await within(dialog).findByRole("button", { name: "Guardar pago" }),
    );
    expect(actions.registerPayment).toHaveBeenLastCalledWith("r1", {
      paidOn: expect.any(String),
      branchId: BRANCHES[0]!.id,
      rows: [{ methodId: METHODS[0]!.id, amountCents: 20000 }],
      skipShopify: false,
    });
    // Ventas no ve la opción de registrarlo solo en el sistema.
    expect(
      within(dialog).queryByRole("checkbox", { name: /Solo en el sistema/ }),
    ).toBeNull();
  });

  it("Registrar pago: el admin puede registrarlo solo en el sistema", async () => {
    const user = userEvent.setup();
    actions.registerPayment.mockResolvedValue({ ok: true });
    render(
      <RegisterPaymentDialog
        restorationId="r1"
        balanceCents={40000}
        suggested={{ kind: "saldo", amount: 40000 }}
        methods={METHODS}
        branches={BRANCHES}
        canSkipShopify
      />,
    );
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog");
    await chooseBranch(user, "PEREDA 4TA - CAJA");
    await chooseMethod(user, "Yape");
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Solo en el sistema/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(actions.registerPayment).toHaveBeenLastCalledWith(
      "r1",
      expect.objectContaining({ skipShopify: true }),
    );
  });

  it("Reembolsar: exige motivo y no más de lo pagado", async () => {
    const user = userEvent.setup();
    actions.refundPayment.mockResolvedValue({ ok: true });
    render(
      <RefundDialog restorationId="r1" paidCents={5000} methods={METHODS} />,
    );
    await user.click(screen.getByRole("button", { name: "Reembolsar" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "Otro método" }),
    ).toBeNull();
    // El reembolso se hace en el pedido del pago: no pide sucursal.
    expect(
      within(dialog).queryByRole("combobox", { name: "Sucursal" }),
    ).toBeNull();
    await chooseMethod(user, "Yape");
    await user.type(within(dialog).getByLabelText("Monto (S/)"), "60");
    const submit = within(dialog).getByRole("button", {
      name: "Registrar reembolso",
    });
    await user.click(submit);
    expect(dialog).toHaveTextContent("El reembolso supera lo pagado");
    await user.clear(within(dialog).getByLabelText("Monto (S/)"));
    await user.type(within(dialog).getByLabelText("Monto (S/)"), "20");
    await user.click(submit);
    expect(dialog).toHaveTextContent("Escribe el motivo del reembolso.");
    await user.type(
      within(dialog).getByLabelText("Motivo (obligatorio)"),
      "Error",
    );
    actions.refundPayment.mockResolvedValueOnce({ error: "No permitido" });
    await user.click(submit);
    expect(await within(dialog).findByText("No permitido")).toBeInTheDocument();
    await user.click(submit);
    expect(actions.refundPayment).toHaveBeenLastCalledWith("r1", {
      methodId: METHODS[0]!.id,
      amountCents: 2000,
      paidOn: expect.any(String),
      reason: "Error",
    });
  });

  it("Reembolsar con un pedido por pago: elige el pago y no pasa de lo que queda de él", async () => {
    const user = userEvent.setup();
    actions.refundPayment.mockResolvedValue({ ok: true });
    render(
      <RefundDialog
        restorationId="r1"
        paidCents={15000}
        methods={METHODS}
        refundablePayments={[
          {
            id: "pay1",
            label: "Adelanto Guía RES-00043 A1 · Yape",
            refundableCents: 10000,
          },
          {
            id: "pay2",
            label: "Saldo Guía RES-00043 · Efectivo",
            refundableCents: 5000,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reembolsar" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", {
      name: "Registrar reembolso",
    });
    await user.click(submit);
    expect(dialog).toHaveTextContent("Elige el pago que se reembolsa.");

    await user.click(
      within(dialog).getByRole("combobox", { name: "Pago que se devuelve" }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Saldo Guía RES-00043/ }),
    );
    // Por defecto, todo lo que queda de ese pago.
    expect(within(dialog).getByLabelText("Monto (S/)")).toHaveValue("50.00");
    await chooseMethod(user, "Efectivo");
    await user.clear(within(dialog).getByLabelText("Monto (S/)"));
    await user.type(within(dialog).getByLabelText("Monto (S/)"), "60");
    await user.type(
      within(dialog).getByLabelText("Motivo (obligatorio)"),
      "Error",
    );
    await user.click(submit);
    expect(dialog).toHaveTextContent(
      "El reembolso supera lo que queda de ese pago (S/ 50.00).",
    );
    await user.clear(within(dialog).getByLabelText("Monto (S/)"));
    await user.type(within(dialog).getByLabelText("Monto (S/)"), "20");
    await user.click(submit);
    expect(actions.refundPayment).toHaveBeenLastCalledWith("r1", {
      methodId: METHODS[1]!.id,
      amountCents: 2000,
      paidOn: expect.any(String),
      reason: "Error",
      paymentId: "pay2",
    });
  });

  it("Aprobar la última pieza: con pago o sin pago", async () => {
    const user = userEvent.setup();
    actions.approveWithPayment.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <ApproveWithPaymentDialog
        open
        onOpenChange={onOpenChange}
        restorationId="r1"
        pieceId="p1"
        pieceCode="RES-00001-1"
        payment={{
          methods: METHODS,
          branches: BRANCHES,
          suggested: { kind: "saldo", amount: 40000 },
        }}
        onDone={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Aprobar y registrar pago" }),
    );
    expect(dialog).toHaveTextContent("Elige la sucursal.");
    await chooseBranch(user, "RUS CARMEN - VENTAS2");
    await user.click(
      within(dialog).getByRole("button", { name: "Aprobar y registrar pago" }),
    );
    expect(dialog).toHaveTextContent("Elige el método de pago.");
    actions.approveWithPayment.mockResolvedValueOnce({
      error: "No se pudo aprobar.",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Aprobar sin pago" }),
    );
    expect(
      await within(dialog).findByText("No se pudo aprobar."),
    ).toBeInTheDocument();
    await chooseMethod(user, "Efectivo");
    await user.click(
      within(dialog).getByRole("button", { name: "Aprobar y registrar pago" }),
    );
    expect(actions.approveWithPayment).toHaveBeenLastCalledWith("r1", ["p1"], {
      paidOn: expect.any(String),
      branchId: BRANCHES[1]!.id,
      rows: [{ methodId: METHODS[1]!.id, amountCents: 40000 }],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Entregar con saldo pendiente: confirma con nota (P45)", async () => {
    const user = userEvent.setup();
    actions.deliverWithBalance.mockResolvedValueOnce({ error: "Sin permiso" });
    actions.deliverWithBalance.mockResolvedValue({ ok: true });
    render(
      <DeliverWithBalanceDialog
        open
        onOpenChange={() => undefined}
        restorationId="r1"
        pieceIds={["p1"]}
        subject="RES-00001-1"
        onDone={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Entregar igual" }),
    );
    expect(await within(dialog).findByText("Sin permiso")).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText("Nota (opcional)"),
      "Confianza",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Entregar igual" }),
    );
    expect(actions.deliverWithBalance).toHaveBeenLastCalledWith(
      "r1",
      ["p1"],
      "Confianza",
    );
  });

  it("Resincronizar pagos llama a la acción (11.4)", async () => {
    const user = userEvent.setup();
    actions.resyncPayments.mockResolvedValueOnce({ error: "Sin orden" });
    actions.resyncPayments.mockResolvedValue({ ok: true });
    render(<ResyncPaymentsButton restorationId="r1" />);
    const button = screen.getByRole("button", { name: "Resincronizar pagos" });
    await user.click(button);
    await user.click(button);
    expect(actions.resyncPayments).toHaveBeenCalledTimes(2);
  });
});
