import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALERT_KINDS, DEFAULT_ALERT_TEMPLATES } from "@/domain/alerts";

import { AlertsForm } from "./alerts-form";

const updateAlertSettings = vi.fn();
vi.mock("@/server/alerts-actions", () => ({
  updateAlertSettings: (...args: unknown[]) => updateAlertSettings(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const recipients = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    fullName: "Ana Admin",
    role: "admin" as const,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    fullName: "Vera Ventas",
    role: "ventas" as const,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    fullName: "Lalo Logística",
    role: "logistica" as const,
  },
];

const defaults = {
  alerts: ALERT_KINDS.map((kind) => ({
    kind,
    enabled: true,
    template: DEFAULT_ALERT_TEMPLATES[kind],
    recipientIds: kind.startsWith("aprobacion")
      ? [recipients[0]!.id, recipients[2]!.id]
      : [recipients[0]!.id, recipients[1]!.id],
  })),
};

const section = (name: string) => screen.getByRole("region", { name });

describe("AlertsForm", () => {
  beforeEach(() => {
    updateAlertSettings.mockReset().mockResolvedValue({ ok: true });
  });

  it("muestra cada alerta con sus usuarios y una vista previa", () => {
    render(<AlertsForm defaultValues={defaults} recipients={recipients} />);
    const parcial = section("Guía parcialmente aprobada");
    expect(within(parcial).getByLabelText(/Lalo Logística/)).toBeChecked();
    expect(within(parcial).queryByLabelText(/Vera Ventas/)).toBeNull();
    expect(
      within(parcial).getByText(/Van 2 de 4 piezas aprobadas/),
    ).toBeVisible();
    const espera = section("Guía en espera del cliente");
    expect(within(espera).getByLabelText(/Vera Ventas/)).toBeChecked();
  });

  it("guarda la alerta desactivada, el mensaje y los usuarios elegidos", async () => {
    const user = userEvent.setup();
    render(<AlertsForm defaultValues={defaults} recipients={recipients} />);
    const pieza = section("Pieza en espera del cliente");

    await user.click(within(pieza).getByLabelText(/Vera Ventas/));
    const message = within(pieza).getByLabelText("Mensaje");
    await user.clear(message);
    await user.type(message, "Pieza de ");
    await user.click(
      within(pieza).getByRole("button", { name: /Insertar \{cliente\}/ }),
    );
    expect(within(pieza).getByText(/Pieza de Juan Rojas/)).toBeVisible();

    const total = section("Guía aprobada");
    await user.click(within(total).getByLabelText("Activa"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    const saved = updateAlertSettings.mock.calls[0]![0].alerts;
    expect(saved[1]).toMatchObject({
      kind: "aprobacion_total",
      enabled: false,
    });
    expect(saved[2]).toMatchObject({
      kind: "pieza_en_espera",
      template: "Pieza de {cliente}",
      recipientIds: [recipients[0]!.id],
    });
  });

  it("no guarda un mensaje con variables desconocidas", async () => {
    const user = userEvent.setup();
    render(<AlertsForm defaultValues={defaults} recipients={recipients} />);
    const parcial = section("Guía parcialmente aprobada");
    const message = within(parcial).getByLabelText("Mensaje");
    await user.clear(message);
    await user.type(message, "Hola {{guai}");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      await within(parcial).findByText("Variables desconocidas: {guai}"),
    ).toBeVisible();
    expect(updateAlertSettings).not.toHaveBeenCalled();

    await user.click(
      within(parcial).getByRole("button", {
        name: "Restaurar mensaje original",
      }),
    );
    expect(message).toHaveValue(DEFAULT_ALERT_TEMPLATES.aprobacion_parcial);
  });

  it("muestra el error del servidor", async () => {
    updateAlertSettings.mockResolvedValue({ error: "No se pudo guardar." });
    const user = userEvent.setup();
    render(<AlertsForm defaultValues={defaults} recipients={recipients} />);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("No se pudo guardar.")).toBeVisible();
  });
});
