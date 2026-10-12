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
      />,
    );
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Adelanto pendiente: S/ 200.00");
    expect(within(dialog).getByLabelText("Monto (S/)")).toHaveValue("200.00");

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
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar pago" }),
    );
    expect(actions.registerPayment).toHaveBeenLastCalledWith("r1", {
      paidOn: expect.any(String),
      rows: [{ methodId: METHODS[0]!.id, amountCents: 20000 }],
    });
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
          suggested: { kind: "saldo", amount: 40000 },
        }}
        onDone={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog");
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
