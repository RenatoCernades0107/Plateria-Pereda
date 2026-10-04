import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_WHATSAPP_TEMPLATE } from "@/domain/whatsapp-template";

import { SettingsForm } from "./settings-form";

const updateSettings = vi.fn();
vi.mock("@/server/settings-actions", () => ({
  updateSettings: (...args: unknown[]) => updateSettings(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const defaults = {
  legalName: "Platería Pereda",
  ruc: "",
  address: "",
  phones: "",
  email: "",
  quoteValidityDays: 15,
  depositPercent: 50,
  whatsappTemplate: "Hola {cliente}",
  terms: "",
};

describe("SettingsForm", () => {
  beforeEach(() => {
    updateSettings.mockReset();
    updateSettings.mockResolvedValue({ ok: true });
  });

  it("guarda los cambios con los valores convertidos", async () => {
    const user = userEvent.setup();
    render(<SettingsForm defaultValues={defaults} />);

    await user.clear(screen.getByLabelText("Vigencia por defecto (días)"));
    await user.type(screen.getByLabelText("Vigencia por defecto (días)"), "30");
    await user.type(screen.getByLabelText("RUC"), "20100047218");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteValidityDays: 30,
        depositPercent: 50,
        ruc: "20100047218",
      }),
    );
  });

  it("muestra los errores y no guarda", async () => {
    const user = userEvent.setup();
    render(<SettingsForm defaultValues={defaults} />);

    await user.type(screen.getByLabelText("RUC"), "123");
    await user.clear(
      screen.getByLabelText("Mensaje de cotización por WhatsApp"),
    );
    await user.type(
      screen.getByLabelText("Mensaje de cotización por WhatsApp"),
      "Hola {{clienet}",
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("Ingresa un RUC válido"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Variables desconocidas: {clienet}"),
    ).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("restaura el mensaje original de WhatsApp", async () => {
    const user = userEvent.setup();
    render(<SettingsForm defaultValues={defaults} />);
    await user.click(
      screen.getByRole("button", { name: "Restaurar mensaje original" }),
    );
    expect(
      screen.getByLabelText("Mensaje de cotización por WhatsApp"),
    ).toHaveValue(DEFAULT_WHATSAPP_TEMPLATE);
  });

  it("muestra el error del servidor", async () => {
    updateSettings.mockResolvedValue({
      error: "No se pudo guardar la configuración.",
    });
    const user = userEvent.setup();
    render(<SettingsForm defaultValues={defaults} />);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      await screen.findByText("No se pudo guardar la configuración."),
    ).toBeInTheDocument();
  });
});
