import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClientOption } from "@/domain/client-search";

import { CompanyContactPicker, companyIdOf } from "./company-contact-picker";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/clients/search-actions", () => ({
  listCompanyContacts: (...a: unknown[]) => mocks.list(...a),
}));
vi.mock("@/server/clients/actions", () => ({
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

const COMPANY_ID = "33333333-3333-4333-8333-333333333333";

const company: ClientOption = {
  source: "local",
  kind: "empresa",
  clientId: COMPANY_ID,
  name: "Joyería Andina SAC",
  documentType: "ruc",
  documentNumber: "20557169866",
  phone: null,
  email: null,
  shopifyCustomerId: null,
};

const ana: ClientOption = {
  source: "local",
  kind: "contacto",
  clientId: COMPANY_ID,
  contactId: "44444444-4444-4444-8444-444444444444",
  name: "Ana Pérez",
  companyName: "Joyería Andina SAC",
  phone: "+51987654321",
  email: null,
  shopifyCustomerId: null,
};

describe("companyIdOf", () => {
  it("solo para empresas y sus contactos", () => {
    expect(companyIdOf(company)).toBe(COMPANY_ID);
    expect(companyIdOf(ana)).toBe(COMPANY_ID);
    expect(companyIdOf({ ...company, kind: "persona" })).toBeNull();
    expect(companyIdOf(null)).toBeNull();
  });
});

describe("CompanyContactPicker", () => {
  it("lista los contactos de la empresa y elige uno o ninguno", async () => {
    mocks.list.mockResolvedValue({ company, contacts: [ana] });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <CompanyContactPicker client={company} canCreate onChange={onChange} />,
    );
    expect(mocks.list).toHaveBeenCalledWith(COMPANY_ID);
    expect(
      await screen.findByRole("button", { name: "Nuevo contacto" }),
    ).toBeInTheDocument();

    const select = screen.getByRole("combobox", {
      name: "Contacto de Joyería Andina SAC",
    });
    await screen.findByText("Sin contacto (a la empresa)");
    await user.click(select);
    await user.click(
      screen.getByRole("option", { name: "Ana Pérez · +51 987 654 321" }),
    );
    expect(onChange).toHaveBeenCalledWith(ana);

    rerender(
      <CompanyContactPicker client={ana} canCreate onChange={onChange} />,
    );
    await user.click(
      screen.getByRole("combobox", { name: "Contacto de Joyería Andina SAC" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Sin contacto (a la empresa)" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(company);
  });

  it("sin permiso no ofrece crear contactos", async () => {
    mocks.list.mockResolvedValue({ company, contacts: [] });
    render(<CompanyContactPicker client={company} onChange={vi.fn()} />);
    expect(
      await screen.findByText("La empresa no tiene contactos registrados."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nuevo contacto" }),
    ).not.toBeInTheDocument();
  });
});
