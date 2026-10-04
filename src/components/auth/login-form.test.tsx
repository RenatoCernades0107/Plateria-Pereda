import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const login = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth-actions", () => ({ login }));

describe("LoginForm", () => {
  beforeEach(() => login.mockReset());

  it("muestra errores de validación sin llamar al servidor", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(
      await screen.findByText("Ingresa un email válido"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ingresa tu contraseña")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("envía los datos normalizados y el destino", async () => {
    login.mockResolvedValue(undefined);
    render(<LoginForm next="/clientes" />);
    await userEvent.type(
      screen.getByLabelText("Email"),
      " Ventas@Pereda.test ",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(login).toHaveBeenCalledWith(
      { email: "ventas@pereda.test", password: "secreta" },
      "/clientes",
    );
  });

  it("muestra el error de credenciales que devuelve el servidor", async () => {
    login.mockResolvedValue({ error: "Email o contraseña incorrectos." });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "ventas@pereda.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email o contraseña incorrectos.",
    );
  });

  it("muestra el aviso recibido (p. ej., usuario desactivado)", () => {
    render(<LoginForm notice="Tu usuario está desactivado." />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tu usuario está desactivado.",
    );
  });
});
