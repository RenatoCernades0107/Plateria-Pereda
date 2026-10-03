import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoverPasswordForm } from "./recover-password-form";
import { ResetPasswordForm } from "./reset-password-form";

const actions = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("@/server/auth-actions", () => actions);

describe("RecoverPasswordForm", () => {
  beforeEach(() => actions.requestPasswordReset.mockReset());

  it("valida el email antes de enviar", async () => {
    render(<RecoverPasswordForm />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar enlace" }),
    );
    expect(
      await screen.findByText("Ingresa un email válido"),
    ).toBeInTheDocument();
    expect(actions.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("muestra la confirmación neutra tras enviar", async () => {
    actions.requestPasswordReset.mockResolvedValue({ ok: true });
    render(<RecoverPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "ventas@pereda.test");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar enlace" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si el email está registrado",
    );
  });

  it("muestra el error del servidor", async () => {
    actions.requestPasswordReset.mockResolvedValue({
      error: "Ingresa un email válido.",
    });
    render(<RecoverPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "ventas@pereda.test");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar enlace" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ingresa un email válido.",
    );
  });
});

describe("ResetPasswordForm", () => {
  beforeEach(() => actions.resetPassword.mockReset());

  it("exige que las contraseñas coincidan", async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Clave-nueva-1",
    );
    await userEvent.type(
      screen.getByLabelText("Repite la contraseña"),
      "Clave-nueva-2",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar contraseña" }),
    );
    expect(
      await screen.findByText("Las contraseñas no coinciden"),
    ).toBeInTheDocument();
    expect(actions.resetPassword).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor", async () => {
    actions.resetPassword.mockResolvedValue({
      error: "La nueva contraseña debe ser distinta de la anterior.",
    });
    render(<ResetPasswordForm />);
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Clave-nueva-1",
    );
    await userEvent.type(
      screen.getByLabelText("Repite la contraseña"),
      "Clave-nueva-1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar contraseña" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "distinta de la anterior",
    );
    expect(actions.resetPassword).toHaveBeenCalledWith({
      password: "Clave-nueva-1",
      confirmPassword: "Clave-nueva-1",
    });
  });
});
