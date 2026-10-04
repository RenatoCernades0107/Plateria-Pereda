import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientOption } from "@/domain/client-search";

import { ClientPicker } from "./client-picker";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  importCustomer: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/clients/search-actions", () => ({
  searchClients: (...a: unknown[]) => mocks.search(...a),
  importShopifyCustomer: (...a: unknown[]) => mocks.importCustomer(...a),
}));
vi.mock("@/server/clients/actions", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const ana: ClientOption = {
  source: "local",
  kind: "persona",
  clientId: "c1",
  name: "Ana Pérez",
  documentType: "dni",
  documentNumber: "45678912",
  phone: "+51999888777",
  email: null,
  shopifyCustomerId: null,
};
const luis: ClientOption = {
  source: "local",
  kind: "contacto",
  clientId: "c2",
  contactId: "k1",
  name: "Luis Rojas",
  companyName: "Andina S.A.C.",
  phone: null,
  email: "luis@andina.pe",
  shopifyCustomerId: null,
};
const rosa: ClientOption = {
  source: "shopify",
  kind: "persona",
  shopifyCustomerId: "gid://shopify/Customer/9",
  name: "Rosa Díaz",
  phone: null,
  email: "rosa@x.pe",
};

async function openAndType(text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  await user.type(
    screen.getByPlaceholderText("Nombre, documento, teléfono o email"),
    text,
  );
  return user;
}

describe("ClientPicker", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.search.mockResolvedValue({
      options: [ana, luis, rosa],
      shopifyUnavailable: false,
    });
  });

  it("muestra los resultados agrupados con sus datos", async () => {
    render(<ClientPicker onSelect={vi.fn()} />);
    await openAndType("an");
    expect(
      await screen.findByRole("option", { name: /Ana Pérez/ }),
    ).toHaveTextContent("Persona · DNI 45678912 · +51 999 888 777");
    expect(
      screen.getByRole("option", { name: /Luis Rojas/ }),
    ).toHaveTextContent("Contacto de Andina S.A.C. · luis@andina.pe");
    expect(screen.getByRole("option", { name: /Rosa Díaz/ })).toHaveTextContent(
      "Solo en Shopify",
    );
    expect(screen.getByText("En el sistema")).toBeInTheDocument();
    expect(screen.getByText("En Shopify")).toBeInTheDocument();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith("an");
  });

  it("se elige con el teclado", async () => {
    const onSelect = vi.fn();
    render(<ClientPicker onSelect={onSelect} />);
    const user = await openAndType("an");
    await screen.findByRole("option", { name: /Ana Pérez/ });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(luis);
  });

  it("elegir uno de Shopify lo guarda primero en el sistema", async () => {
    const saved = { ...ana, clientId: "c9", name: "Rosa Díaz" };
    mocks.importCustomer.mockResolvedValue({ ok: true, option: saved });
    const onSelect = vi.fn();
    render(<ClientPicker onSelect={onSelect} />);
    const user = await openAndType("ro");
    await user.click(await screen.findByRole("option", { name: /Rosa Díaz/ }));
    expect(mocks.importCustomer).toHaveBeenCalledWith(
      "gid://shopify/Customer/9",
    );
    expect(onSelect).toHaveBeenCalledWith(saved);
    expect(mocks.success).toHaveBeenCalledWith(
      "Rosa Díaz se guardó en el sistema.",
    );
  });

  it("informa si no se pudo guardar el cliente de Shopify", async () => {
    mocks.importCustomer.mockResolvedValue({
      error: "El cliente ya no existe en Shopify.",
    });
    const onSelect = vi.fn();
    render(<ClientPicker onSelect={onSelect} />);
    const user = await openAndType("ro");
    await user.click(await screen.findByRole("option", { name: /Rosa Díaz/ }));
    expect(mocks.error).toHaveBeenCalledWith(
      "El cliente ya no existe en Shopify.",
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("estados: pocas letras, sin resultados y Shopify caído", async () => {
    mocks.search.mockResolvedValue({ options: [], shopifyUnavailable: true });
    render(<ClientPicker onSelect={vi.fn()} />);
    const user = await openAndType("a");
    expect(
      screen.getByText("Escribe al menos 2 caracteres."),
    ).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("Nombre, documento, teléfono o email"),
      "x",
    );
    expect(
      await screen.findByText("No se encontraron clientes."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Shopify no respondió/)).toBeInTheDocument();
  });

  it("avisa si la búsqueda falla", async () => {
    mocks.search.mockRejectedValue(new Error("x"));
    render(<ClientPicker onSelect={vi.fn()} />);
    await openAndType("an");
    await vi.waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "No se pudo buscar. Intenta de nuevo.",
      ),
    );
  });

  it("ofrece crear un cliente nuevo solo si se permite", async () => {
    const { unmount } = render(<ClientPicker onSelect={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    expect(
      screen.queryByRole("option", { name: "Crear nuevo cliente" }),
    ).not.toBeInTheDocument();
    unmount();

    render(<ClientPicker onSelect={vi.fn()} canCreate />);
    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", { name: "Crear nuevo cliente" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Nuevo cliente" }),
    ).toBeInTheDocument();
  });

  it("muestra el cliente elegido", () => {
    render(<ClientPicker value={ana} onSelect={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Ana Pérez");
  });
});
