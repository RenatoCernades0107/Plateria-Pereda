import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteIssuer } from "@/domain/quote-issuers";

import { QuoteIssuersManager } from "./quote-issuers-manager";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  active: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/quote-issuers-actions", () => ({
  createQuoteIssuer: (...a: unknown[]) => mocks.create(...a),
  updateQuoteIssuer: (...a: unknown[]) => mocks.update(...a),
  setQuoteIssuerActive: (...a: unknown[]) => mocks.active(...a),
  deleteQuoteIssuer: (...a: unknown[]) => mocks.remove(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const sac: QuoteIssuer = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "PEREDA SAC",
  legalName: "PEREDA SAC",
  documentType: "ruc",
  documentNumber: "20557169866",
  bankName: "Banco de Crédito (BCP)",
  accountLabel: "CTA CTE soles",
  accountNumber: "1942229780029",
  cci: "00219400222978002998",
  active: true,
};
const carmen: QuoteIssuer = {
  ...sac,
  id: "66666666-6666-4666-8666-666666666666",
  name: "CARMEN",
  legalName: "Regina Pereda Luque",
  documentType: "dni",
  documentNumber: "07863594",
  accountLabel: "CTA AHORRO soles",
  accountNumber: "19493993660088",
  cci: "00219419399366008899",
};

describe("QuoteIssuersManager", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.update.mockResolvedValue({ ok: true });
    mocks.remove.mockResolvedValue({ ok: true });
  });

  it("muestra cada sucursal como sale en el PDF", () => {
    render(<QuoteIssuersManager issuers={[sac, carmen]} />);
    const sacRow = screen.getByTestId("sucursal-cotizacion-PEREDA SAC");
    expect(sacRow).toHaveTextContent("Razón social: PEREDA SAC");
    expect(sacRow).toHaveTextContent("RUC: 20557169866");
    const carmenRow = screen.getByTestId("sucursal-cotizacion-CARMEN");
    expect(carmenRow).toHaveTextContent(
      "CTA AHORRO soles: 19493993660088; CCI: 00219419399366008899",
    );
    expect(carmenRow).not.toHaveTextContent("Razón social");
  });

  it("al editar, avisa antes de guardar los datos sensibles", async () => {
    const user = userEvent.setup();
    render(<QuoteIssuersManager issuers={[sac]} />);
    await user.click(screen.getByRole("button", { name: "Editar PEREDA SAC" }));
    const cci = screen.getByLabelText("CCI");
    await user.clear(cci);
    await user.type(cci, "00219400222978002999");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // Primero el aviso; todavía no se guarda.
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/datos bancarios y tributarios/),
    ).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Sí, guardar cambios" }),
    );
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        sac.id,
        expect.objectContaining({ cci: "00219400222978002999" }),
      ),
    );
    expect(mocks.success).toHaveBeenCalledWith("Cambios guardados.");
  });

  it("no guarda datos inválidos", async () => {
    const user = userEvent.setup();
    render(<QuoteIssuersManager issuers={[sac]} />);
    await user.click(screen.getByRole("button", { name: "Editar PEREDA SAC" }));
    const ruc = screen.getByLabelText("Número de RUC");
    await user.clear(ruc);
    await user.type(ruc, "123");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(ruc).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.queryByRole("button", { name: "Sí, guardar cambios" }),
    ).not.toBeInTheDocument();
  });

  it("al eliminar, pide confirmación con la advertencia", async () => {
    const user = userEvent.setup();
    render(<QuoteIssuersManager issuers={[sac]} />);
    await user.click(
      screen.getByRole("button", { name: "Eliminar PEREDA SAC" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/datos bancarios y tributarios/);
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(sac.id));
  });
});
