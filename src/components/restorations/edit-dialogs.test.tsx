import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PieceDetail } from "@/server/restorations/queries";

import { EditRestorationDialog, PieceDialog } from "./edit-dialogs";

const mocks = vi.hoisted(() => ({
  updatePiece: vi.fn(),
  addPiece: vi.fn(),
  updateRestoration: vi.fn(),
}));

vi.mock("@/server/restorations/actions", () => ({
  updatePiece: (...a: unknown[]) => mocks.updatePiece(...a),
  addPiece: (...a: unknown[]) => mocks.addPiece(...a),
  updateRestoration: (...a: unknown[]) => mocks.updateRestoration(...a),
  createRestoration: vi.fn(),
  listClientContacts: vi.fn(),
}));
vi.mock("@/server/clients/search-actions", () => ({
  searchClients: vi.fn(),
  importShopifyCustomer: vi.fn(),
}));
vi.mock("@/server/clients/actions", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/restauraciones/r1",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece: PieceDetail = {
  id: "p1",
  number: 1,
  code: "RES-00001-1",
  status: "aprobada",
  location: "en_tienda",
  urgent: false,
  readyForDelivery: false,
  description: "Fuente",
  measure: "40 cm",
  materialName: "Plata",
  serviceName: "",
  weightGrams: 820.5,
  workshopId: null,
  workshopName: null,
  materialId: null,
  serviceId: null,
  notes: "",
  arrivedAt: "2026-10-04T10:00:00Z",
  createdAt: "2026-10-04T10:00:00Z",
  deliveredAt: null,
  returnedAt: null,
  priceCents: 120050,
};

const props = { workshops: [], materials: [], services: [] };

beforeEach(() => {
  for (const fn of Object.values(mocks))
    fn.mockReset().mockResolvedValue({ ok: true });
});

describe("PieceDialog", () => {
  it("edita con los datos de la pieza y deshabilita lo que no se puede cambiar", async () => {
    const user = userEvent.setup();
    render(
      <PieceDialog
        restorationId="r1"
        piece={piece}
        editable={["description", "material", "notes"]}
        priceHint="Solo el administrador cambia el precio."
        {...props}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Editar pieza RES-00001-1" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Precio (S/)")).toHaveValue("1200.50");
    expect(within(dialog).getByLabelText("Precio (S/)")).toBeDisabled();
    expect(within(dialog).getByLabelText("Medida")).toBeDisabled();
    expect(
      within(dialog).getByText("Solo el administrador cambia el precio."),
    ).toBeVisible();
    expect(
      within(dialog).queryByLabelText("La pieza ya está en tienda"),
    ).toBeNull();

    await user.clear(within(dialog).getByLabelText("Material"));
    await user.type(within(dialog).getByLabelText("Material"), "Plata 925");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );
    expect(mocks.updatePiece).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        material: { id: null, name: "Plata 925" },
        price: "1200.50",
        weight: "820.5",
      }),
    );
  });

  it("agrega una pieza y muestra el error de la BD", async () => {
    mocks.addPiece.mockResolvedValue({ error: "No se agregan piezas" });
    const user = userEvent.setup();
    render(<PieceDialog restorationId="r1" {...props} />);
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Descripción"), "Azucarera");
    await user.type(within(dialog).getByLabelText("Precio (S/)"), "64.5");
    await user.click(
      within(dialog).getByRole("button", { name: "Agregar pieza" }),
    );
    expect(mocks.addPiece).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ description: "Azucarera", price: "64.5" }),
    );
    expect(
      await within(dialog).findByText("No se agregan piezas"),
    ).toBeVisible();
  });
});

describe("EditRestorationDialog", () => {
  it("cambia el tipo de pago y oculta el % fuera de A cuenta", async () => {
    const user = userEvent.setup();
    render(
      <EditRestorationDialog
        restorationId="r1"
        initial={{
          contactId: "00000000-0000-0000-0000-0000000000c1",
          paymentType: "a_cuenta",
          depositPercent: 30,
          notes: "",
        }}
        contacts={[
          {
            id: "00000000-0000-0000-0000-0000000000c1",
            name: "Luis Rojas",
            position: "",
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Adelanto (%)")).toHaveValue("30");
    expect(within(dialog).getByLabelText("Contacto")).toHaveTextContent(
      "Luis Rojas",
    );

    await user.click(within(dialog).getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al contado" }));
    expect(within(dialog).queryByLabelText("Adelanto (%)")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );
    expect(mocks.updateRestoration).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({
        paymentType: "contado",
        contactId: "00000000-0000-0000-0000-0000000000c1",
      }),
    );
  });
});
