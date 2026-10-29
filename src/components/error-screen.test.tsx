import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorScreen } from "./error-screen";

describe("ErrorScreen", () => {
  afterEach(() => vi.restoreAllMocks());

  it("muestra el código del error y reintenta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("detalle interno"), {
      digest: "4242",
    });
    render(<ErrorScreen error={error} retry={retry} title="Algo salió mal" />);

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/con este código: 4242/)).toBeInTheDocument();
    expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute(
      "href",
      "/",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalled();
  });

  it("a pantalla completa es el <main> de la página", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorScreen
        error={new Error("x")}
        retry={() => {}}
        title="Algo salió mal"
        fullScreen
      />,
    );
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
