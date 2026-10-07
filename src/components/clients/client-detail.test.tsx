import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseClientFilters } from "@/domain/client-filters";
import type {
  ClientDetail,
  ClientListItem,
  ContactDetail,
} from "@/server/clients/queries";

import { ClientsFiltersForm } from "./clients-filters-form";
import { ClientsList } from "./clients-list";
import { ContactsSection } from "./contacts-section";
import { EditClientDialog } from "./edit-client-dialog";

const mocks = vi.hoisted(() => ({
  updateClient: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  setContactActive: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/clients/actions", () => ({
  updateClient: (...a: unknown[]) => mocks.updateClient(...a),
  createContact: (...a: unknown[]) => mocks.createContact(...a),
  updateContact: (...a: unknown[]) => mocks.updateContact(...a),
  setContactActive: (...a: unknown[]) => mocks.setContactActive(...a),
  setClientActive: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/server/shopify-sync/actions", () => ({ retryShopifyJob: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clientes/c2",
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const contact: ContactDetail = {
  id: "k1",
  firstName: "Luis",
  lastName: "Rojas",
  displayName: "Luis Rojas",
  position: "Compras",
  documentType: null,
  documentNumber: null,
  phone: "+51988777666",
  email: "luis@andina.pe",
  active: true,
  sync: { jobId: 3, status: "ok", lastError: null },
};

const company: ClientDetail = {
  id: "c2",
  kind: "empresa",
  displayName: "Andina S.A.C.",
  firstName: "",
  lastName: "",
  legalName: "Andina S.A.C.",
  documentType: "ruc",
  documentNumber: "20100047218",
  phone: "+5112345678",
  email: null,
  address: "Av. Larco 123",
  city: "Arequipa",
  region: "ARE",
  notes: "",
  active: true,
  createdAt: "2026-10-04T10:00:00Z",
  sync: { jobId: 1, status: "ok", lastError: null },
  contacts: [
    contact,
    {
      ...contact,
      id: "k2",
      displayName: "Rosa Díaz",
      firstName: "Rosa",
      lastName: "Díaz",
      active: false,
      sync: null,
    },
  ],
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("EditClientDialog", () => {
  it("abre con los datos de la empresa y guarda los cambios", async () => {
    mocks.updateClient.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<EditClientDialog client={company} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("RUC")).toHaveValue("20100047218");
    expect(within(dialog).getByLabelText("Teléfono")).toHaveValue("12345678");
    const name = within(dialog).getByLabelText("Razón social");
    await user.clear(name);
    await user.type(name, "Andina del Sur S.A.C.");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(mocks.updateClient).toHaveBeenCalledWith(
      "c2",
      expect.objectContaining({
        kind: "empresa",
        legalName: "Andina del Sur S.A.C.",
        region: "ARE",
        city: "Arequipa",
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Cambios guardados. Se actualizarán en Shopify.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edita una persona y muestra el error del servidor", async () => {
    mocks.updateClient.mockResolvedValue({
      error: "Ya existe un cliente con ese documento.",
    });
    const user = userEvent.setup();
    render(
      <EditClientDialog
        client={{
          ...company,
          kind: "persona",
          displayName: "Ana Pérez",
          firstName: "Ana",
          lastName: "Pérez",
          legalName: "",
          documentType: "dni",
          documentNumber: "45678912",
          phone: "+51999888777",
          sync: null,
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Nombres")).toHaveValue("Ana");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );
    expect(mocks.updateClient).toHaveBeenCalledWith(
      "c2",
      expect.objectContaining({
        kind: "persona",
        document: { documentType: "dni", documentNumber: "45678912" },
      }),
    );
    expect(
      await within(dialog).findByText(
        "Ya existe un cliente con ese documento.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ContactsSection", () => {
  it("lista los contactos con su estado y agrega uno nuevo", async () => {
    mocks.createContact.mockResolvedValue({
      ok: true,
      id: "k3",
      displayName: "Pedro Soto",
    });
    const user = userEvent.setup();
    render(<ContactsSection client={company} canEdit />);

    const luis = screen.getByTestId("contacto-Luis Rojas");
    expect(luis).toHaveTextContent("Compras");
    expect(luis).toHaveTextContent("+51 988 777 666");
    expect(within(luis).getByTestId("estado-shopify")).toHaveTextContent(
      "Sincronizado",
    );
    expect(screen.getByTestId("contacto-Rosa Díaz")).toHaveTextContent(
      "Inactivo",
    );

    await user.click(screen.getByRole("button", { name: "Agregar contacto" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Agregar contacto" }),
    );
    expect(await within(dialog).findByText("Ingresa el nombre")).toBeVisible();
    expect(mocks.createContact).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Nombres"), "Pedro");
    await user.type(within(dialog).getByLabelText("Apellidos"), "Soto");
    await user.type(within(dialog).getByLabelText("Teléfono"), "977666555");
    await user.click(
      within(dialog).getByRole("button", { name: "Agregar contacto" }),
    );
    expect(mocks.createContact).toHaveBeenCalledWith(
      "c2",
      expect.objectContaining({ firstName: "Pedro", phone: "+51 977666555" }),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Se agregó a Pedro Soto como contacto. Se está enviando a Shopify.",
    );
  });

  it("edita y desactiva un contacto", async () => {
    mocks.updateContact.mockResolvedValue({ ok: true });
    mocks.setContactActive.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ContactsSection client={company} canEdit />);

    await user.click(screen.getByRole("button", { name: "Editar Luis Rojas" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Email")).toHaveValue(
      "luis@andina.pe",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );
    expect(mocks.updateContact).toHaveBeenCalledWith(
      "k1",
      expect.objectContaining({ firstName: "Luis", position: "Compras" }),
    );
    expect(mocks.success).toHaveBeenCalledWith("Contacto actualizado.");

    await user.click(
      screen.getByRole("button", { name: "Desactivar Luis Rojas" }),
    );
    expect(mocks.setContactActive).toHaveBeenCalledWith("k1", false);
    await user.click(screen.getByRole("button", { name: "Activar Rosa Díaz" }));
    expect(mocks.setContactActive).toHaveBeenCalledWith("k2", true);
  });

  it("sin permiso de edición solo muestra los contactos; sin contactos, un aviso", () => {
    const { rerender } = render(
      <ContactsSection client={company} canEdit={false} />,
    );
    expect(
      screen.queryByRole("button", { name: "Agregar contacto" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Editar/ }),
    ).not.toBeInTheDocument();
    rerender(
      <ContactsSection client={{ ...company, contacts: [] }} canEdit={false} />,
    );
    expect(
      screen.getByText("Esta empresa aún no tiene contactos."),
    ).toBeInTheDocument();
  });
});

describe("ClientsList (detalle)", () => {
  it("enlaza cada cliente con su detalle y marca los inactivos", () => {
    const item: ClientListItem = {
      id: "c1",
      kind: "persona",
      displayName: "Ana Pérez",
      documentType: null,
      documentNumber: null,
      phone: null,
      email: null,
      active: false,
      sync: { jobId: null, status: "ok", lastError: null },
    };
    render(<ClientsList clients={[item]} canRetry />);
    const fila = screen.getByTestId("cliente-Ana Pérez");
    expect(
      within(fila).getByRole("link", { name: "Ana Pérez" }),
    ).toHaveAttribute("href", "/clientes/c1");
    expect(fila).toHaveTextContent("Inactivo");
  });

  it("usa el mensaje vacío que recibe", () => {
    render(
      <ClientsList
        clients={[]}
        canRetry
        emptyMessage="No hay clientes con esos filtros."
      />,
    );
    expect(
      screen.getByText("No hay clientes con esos filtros."),
    ).toBeInTheDocument();
  });
});

describe("ClientsFiltersForm", () => {
  it("lleva los filtros a la URL desde la primera página", async () => {
    const user = userEvent.setup();
    render(
      <ClientsFiltersForm filters={parseClientFilters({ pagina: "3" })} />,
    );
    await user.type(
      screen.getByLabelText("Nombre, documento, teléfono o email"),
      "andina",
    );
    await user.click(screen.getByLabelText("Tipo"));
    await user.click(await screen.findByRole("option", { name: "Empresas" }));
    await user.click(screen.getByLabelText("Shopify"));
    await user.click(await screen.findByRole("option", { name: "Con error" }));
    await user.click(screen.getByLabelText("Estado"));
    await user.click(await screen.findByRole("option", { name: "Todos" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(mocks.push).toHaveBeenCalledWith(
      "/clientes?q=andina&tipo=empresa&sync=error&estado=todos",
    );

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/clientes");
    expect(
      screen.getByLabelText("Nombre, documento, teléfono o email"),
    ).toHaveValue("");
  });
});
