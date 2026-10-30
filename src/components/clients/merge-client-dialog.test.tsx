import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MergeClientDialog } from "./merge-client-dialog";

const mocks = vi.hoisted(() => ({
  findDuplicatesOf: vi.fn(),
  mergeClients: vi.fn(),
  searchClients: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/clients/actions", () => ({
  findDuplicatesOf: (...a: unknown[]) => mocks.findDuplicatesOf(...a),
  mergeClients: (...a: unknown[]) => mocks.mergeClients(...a),
}));
vi.mock("@/server/clients/search-actions", () => ({
  searchClients: (...a: unknown[]) => mocks.searchClients(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const duplicate = {
  id: "c2",
  kind: "persona",
  name: "MARIA PIA TOMATIS",
  documentType: null,
  documentNumber: null,
  phone: "+51999497325",
  email: null,
  reasons: ["nombre"],
};

describe("MergeClientDialog", () => {
  beforeEach(() => {
    mocks.findDuplicatesOf.mockReset().mockResolvedValue([duplicate]);
    mocks.mergeClients.mockReset().mockResolvedValue({
      ok: true,
      summary: "Se pasó 1 guía a María Pía Tomatis.",
    });
    mocks.searchClients.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("sugiere el duplicado, explica la fusión y la hace", async () => {
    const user = userEvent.setup();
    render(
      <MergeClientDialog
        client={{ id: "c1", displayName: "María Pía Tomatis" }}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Fusionar duplicado" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(mocks.findDuplicatesOf).toHaveBeenCalledWith("c1");
    expect(await within(dialog).findByText("MARIA PIA TOMATIS")).toBeVisible();
    expect(within(dialog).getByText("Mismo nombre")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Elegir" }));
    expect(dialog).toHaveTextContent("En Shopify no se borra nada");
    await user.click(within(dialog).getByRole("button", { name: "Fusionar" }));

    expect(mocks.mergeClients).toHaveBeenCalledWith("c1", "c2");
    expect(mocks.success).toHaveBeenCalledWith(
      "Se pasó 1 guía a María Pía Tomatis.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("busca otras personas (sin incluirse ni empresas) y muestra el error", async () => {
    mocks.findDuplicatesOf.mockResolvedValue([]);
    mocks.searchClients.mockResolvedValue({
      shopifyUnavailable: false,
      options: [
        {
          source: "local",
          kind: "persona",
          clientId: "c1",
          name: "María Pía Tomatis",
          documentType: null,
          documentNumber: null,
          phone: null,
          email: null,
          shopifyCustomerId: null,
        },
        {
          source: "local",
          kind: "empresa",
          clientId: "c3",
          name: "Tomatis S.A.C.",
          documentType: "ruc",
          documentNumber: "20100047218",
          phone: null,
          email: null,
          shopifyCustomerId: null,
        },
        {
          source: "local",
          kind: "persona",
          clientId: "c2",
          name: "Pía Tomatis",
          documentType: null,
          documentNumber: null,
          phone: null,
          email: null,
          shopifyCustomerId: null,
        },
      ],
    });
    mocks.mergeClients.mockResolvedValue({
      error: "Uno de los clientes ya se fusionó con otro.",
    });
    const user = userEvent.setup();
    render(
      <MergeClientDialog
        client={{ id: "c1", displayName: "María Pía Tomatis" }}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Fusionar duplicado" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText(/No encontramos duplicados/),
    ).toBeVisible();
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Buscar el cliente duplicado",
      }),
      "tomatis",
    );
    expect(await within(dialog).findByText("Pía Tomatis")).toBeVisible();
    expect(
      within(dialog).getAllByRole("button", { name: "Elegir" }),
    ).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Elegir" }));
    await user.click(within(dialog).getByRole("button", { name: "Fusionar" }));
    expect(mocks.error).toHaveBeenCalledWith(
      "Uno de los clientes ya se fusionó con otro.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
