import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientListItem } from "@/server/clients/queries";

import { ClientsList } from "./clients-list";
import { NewClientDialog } from "./new-client-dialog";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  findSimilarClients: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/server/clients/actions", () => ({
  createClient: (...a: unknown[]) => mocks.createClient(...a),
  findSimilarClients: (...a: unknown[]) => mocks.findSimilarClients(...a),
}));
vi.mock("@/server/shopify-sync/actions", () => ({ retryShopifyJob: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/clientes" }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: vi.fn() },
}));

describe("NewClientDialog", () => {
  beforeEach(() => {
    mocks.createClient
      .mockReset()
      .mockResolvedValue({ ok: true, id: "c1", displayName: "Ana Pérez" });
    mocks.findSimilarClients.mockReset().mockResolvedValue([]);
    mocks.success.mockReset();
  });

  const similar = {
    id: "c9",
    kind: "persona",
    name: "ANA PÉREZ",
    documentType: null,
    documentNumber: null,
    phone: "+51999888777",
    email: null,
    reasons: ["telefono", "nombre"],
  };

  async function fillPerson(user: ReturnType<typeof userEvent.setup>) {
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nombres"), "Ana");
    await user.type(within(dialog).getByLabelText("Apellidos"), "Pérez");
    await user.type(within(dialog).getByLabelText("Teléfono"), "999 888 777");
    await user.click(
      within(dialog).getByRole("button", { name: "Registrar persona" }),
    );
    return dialog;
  }

  it("avisa si ya hay un cliente parecido y permite usarlo", async () => {
    mocks.findSimilarClients.mockResolvedValue([similar]);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<NewClientDialog onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialog = await fillPerson(user);

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("¿Ya está registrado?");
    expect(alert).toHaveTextContent("Mismo teléfono y nombre");
    expect(mocks.createClient).not.toHaveBeenCalled();
    // El formulario no se borra mientras se decide.
    expect(within(dialog).getByLabelText("Nombres")).toHaveValue("Ana");

    await user.click(
      within(alert).getByRole("button", { name: "Usar este cliente" }),
    );
    expect(onCreated).toHaveBeenCalledWith({
      id: "c9",
      displayName: "ANA PÉREZ",
      kind: "persona",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si no es el mismo, registra el nuevo igual", async () => {
    mocks.findSimilarClients.mockResolvedValue([similar]);
    const user = userEvent.setup();
    render(<NewClientDialog />);
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialog = await fillPerson(user);
    const alert = await within(dialog).findByRole("alert");
    // Sin `onCreated`, se enlaza a la ficha del existente.
    expect(
      within(alert).getByRole("link", { name: "Ver ficha" }),
    ).toHaveAttribute("href", "/clientes/c9");
    await user.click(
      within(alert).getByRole("button", {
        name: "No es el mismo: registrar nuevo",
      }),
    );
    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Ana", lastName: "Pérez" }),
    );
  });

  it("con el mismo documento no ofrece registrar otro", async () => {
    mocks.findSimilarClients.mockResolvedValue([
      { ...similar, reasons: ["documento"] },
    ]);
    const user = userEvent.setup();
    render(<NewClientDialog />);
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialog = await fillPerson(user);
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Ya existe un cliente con ese documento.");
    expect(
      within(alert).queryByRole("button", { name: /registrar nuevo/ }),
    ).not.toBeInTheDocument();
  });

  it("registra una persona y avisa a quien la abrió", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<NewClientDialog onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nombres"), "Ana");
    await user.type(within(dialog).getByLabelText("Apellidos"), "Pérez");
    await user.click(within(dialog).getByLabelText("Tipo de documento"));
    await user.click(await screen.findByRole("option", { name: "DNI" }));
    await user.type(
      within(dialog).getByLabelText("Número de documento"),
      "45678912",
    );
    await user.type(within(dialog).getByLabelText("Teléfono"), "999 888 777");
    await user.click(
      within(dialog).getByRole("button", { name: "Registrar persona" }),
    );

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "persona",
        firstName: "Ana",
        document: { documentType: "dni", documentNumber: "45678912" },
        phone: "+51 999888777",
      }),
    );
    expect(onCreated).toHaveBeenCalledWith({
      id: "c1",
      displayName: "Ana Pérez",
    });
    expect(mocks.success).toHaveBeenCalledWith(
      "Ana Pérez registrado. Se está enviando a Shopify.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("valida la empresa y muestra el error del servidor", async () => {
    mocks.createClient.mockResolvedValue({
      error: "Ya existe un cliente con ese documento.",
    });
    const user = userEvent.setup();
    render(<NewClientDialog />);
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    await user.click(screen.getByRole("tab", { name: "Empresa" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Registrar empresa" }),
    );
    expect(
      await within(dialog).findByText("Ingresa la razón social"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Ingresa el RUC")).toBeInTheDocument();
    expect(mocks.createClient).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByLabelText("Razón social"),
      "Andina S.A.C.",
    );
    await user.type(within(dialog).getByLabelText("RUC"), "20100047218");
    await user.type(within(dialog).getByLabelText("Teléfono"), "012345678");
    expect(within(dialog).getByLabelText("Ciudad")).toHaveValue("Lima");
    await user.click(
      within(dialog).getByRole("button", { name: "Registrar empresa" }),
    );
    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "empresa", region: "LIM", city: "Lima" }),
    );
    expect(
      await within(dialog).findByText(
        "Ya existe un cliente con ese documento.",
      ),
    ).toBeInTheDocument();
  });
});

const client = (overrides: Partial<ClientListItem>): ClientListItem => ({
  id: "c1",
  kind: "persona",
  displayName: "Ana Pérez",
  documentType: "dni",
  documentNumber: "45678912",
  phone: "+51999888777",
  email: "ana@correo.pe",
  active: true,
  sync: { jobId: 1, status: "ok", lastError: null },
  ...overrides,
});

describe("ClientsList", () => {
  it("muestra tipo, documento, teléfono legible y estado de Shopify", () => {
    render(
      <ClientsList
        canRetry
        clients={[
          client({}),
          client({
            id: "c2",
            kind: "empresa",
            displayName: "Andina",
            documentType: "ruc",
            documentNumber: "20100047218",
            phone: null,
            email: null,
            sync: { jobId: 2, status: "error", lastError: "x" },
          }),
          client({
            id: "c3",
            displayName: "Sin sync",
            documentType: null,
            documentNumber: null,
            sync: null,
          }),
        ]}
      />,
    );
    const ana = screen.getByTestId("cliente-Ana Pérez");
    expect(ana).toHaveTextContent("Persona");
    expect(ana).toHaveTextContent("DNI 45678912");
    expect(ana).toHaveTextContent("+51 999 888 777");
    expect(ana).toHaveTextContent("Shopify: Sincronizado");
    const andina = screen.getByTestId("cliente-Andina");
    expect(andina).toHaveTextContent("Empresa");
    expect(
      within(andina).getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cliente-Sin sync")).toHaveTextContent("—");
  });

  it("sin clientes muestra un mensaje", () => {
    render(<ClientsList clients={[]} canRetry={false} />);
    expect(
      screen.getByText("Aún no hay clientes registrados."),
    ).toBeInTheDocument();
  });
});
