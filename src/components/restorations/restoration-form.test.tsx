import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { liveTotal, RestorationForm } from "./restoration-form";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/server/restorations/actions", () => ({
  createRestoration: (...a: unknown[]) => mocks.create(...a),
  listClientContacts: async () => [],
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

function renderForm() {
  return render(
    <RestorationForm
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
});

describe("RestorationForm", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.push.mockReset();
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

  it("propone el precio sugerido del servicio elegido del catálogo", async () => {
    const user = userEvent.setup();
    renderForm();
    const card = within(screen.getByTestId("pieza-1"));
    await user.type(card.getByLabelText("Servicio"), "Limpieza");
    expect(card.getByLabelText("Precio (S/)")).toHaveValue("40.00");
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
    expect(first.getByText("Ingresa el precio")).toBeVisible();
    expect(
      second.getByText("Describe la pieza (qué es y cómo está)"),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("el % de adelanto solo se pide en A cuenta", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText("Adelanto (%)")).toHaveValue("50");
    await user.type(
      within(screen.getByTestId("pieza-1")).getByLabelText("Precio (S/)"),
      "80",
    );

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al crédito" }));
    expect(screen.queryByLabelText("Adelanto (%)")).toBeNull();
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("S/ 0.00");

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al contado" }));
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent(
      "S/ 80.00",
    );

    await user.click(screen.getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "A cuenta" }));
    const percent = screen.getByLabelText("Adelanto (%)");
    await user.clear(percent);
    await user.type(percent, "0");
    expect(screen.getByTestId("adelanto-en-vivo")).toHaveTextContent("—");
  });
});
