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
  serviceName: "Limpieza",
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

  it("muestra la descripción y las notas antes que el servicio y los datos cortos", async () => {
    const user = userEvent.setup();
    render(<PieceDialog restorationId="r1" {...props} />);
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    const dialog = within(screen.getByRole("dialog"));
    const order = [
      "Descripción",
      "Notas de la pieza",
      "Servicio",
      "Material",
      "Peso (g)",
      "Medida",
      "Precio (S/)",
    ].map((label) => dialog.getByLabelText(label));
    order.slice(1).forEach((field, i) => {
      expect(
        order[i]!.compareDocumentPosition(field) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
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
    // El servicio es obligatorio (D59).
    expect(
      await within(dialog).findByText("Elige o escribe el servicio"),
    ).toBeVisible();
    expect(mocks.addPiece).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("Servicio"), "Pulido");
    await user.click(
      within(dialog).getByRole("button", { name: "Agregar pieza" }),
    );
    expect(mocks.addPiece).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({
        description: "Azucarera",
        service: { id: null, name: "Pulido" },
        price: "64.5",
      }),
    );
    expect(
      await within(dialog).findByText("No se agregan piezas"),
    ).toBeVisible();
  });
});

describe("PieceDialog: taller (D60)", () => {
  const SALES = [
    "description",
    "service",
    "measure",
    "material",
    "weight",
    "notes",
    "urgent",
  ] as const;

  it("ventas ve el taller asignado como texto, sin poder cambiarlo", async () => {
    const user = userEvent.setup();
    render(
      <PieceDialog
        restorationId="r1"
        piece={{ ...piece, workshopId: "w9", workshopName: "Taller Viejo" }}
        editable={SALES}
        {...props}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Editar pieza RES-00001-1" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Taller")).toBeNull();
    expect(within(dialog).getByTestId("taller-solo-lectura")).toHaveTextContent(
      "Taller Viejo",
    );
    expect(
      within(dialog).getByText("Lo asignan logística y el administrador."),
    ).toBeVisible();
  });

  it("ventas no elige taller al agregar una pieza; el admin sí", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <PieceDialog restorationId="r1" editable={SALES} {...props} />,
    );
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    expect(within(screen.getByRole("dialog")).queryByText("Taller")).toBeNull();
    unmount();

    render(
      <PieceDialog
        restorationId="r1"
        workshops={[{ id: "w1", name: "Taller Central" }]}
        materials={[]}
        services={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    expect(
      within(screen.getByRole("dialog")).getByLabelText("Taller"),
    ).toBeEnabled();
  });
});

describe("PieceDialog: precio de venta sin asignar (D58)", () => {
  it("una pieza sin precio muestra «Por definir» y se guarda sin precio", async () => {
    const user = userEvent.setup();
    render(
      <PieceDialog
        restorationId="r1"
        piece={{ ...piece, priceCents: null }}
        {...props}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Editar pieza RES-00001-1" }),
    );
    const dialog = screen.getByRole("dialog");
    const price = within(dialog).getByLabelText("Precio (S/)");
    expect(price).toHaveValue("");
    expect(price).toHaveAttribute("placeholder", "Por definir");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );
    expect(mocks.updatePiece).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ price: "" }),
    );
  });
});

describe("EditRestorationDialog", () => {
  it("cambia el tipo de pago y oculta el adelanto fuera de A cuenta", async () => {
    const user = userEvent.setup();
    render(
      <EditRestorationDialog
        restorationId="r1"
        initial={{
          contactId: "00000000-0000-0000-0000-0000000000c1",
          paymentType: "a_cuenta",
          depositAmountCents: 30000,
          totalCents: 100000,
          pricesIncludeIgv: true,
          notes: "",
        }}
        hasOrder={false}
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
    expect(within(dialog).getByLabelText("Notas generales")).toBeVisible();
    expect(
      within(dialog).getByLabelText("Adelanto (S/) (opcional)"),
    ).toHaveValue("300.00");
    expect(within(dialog).getByTestId("adelanto-porcentaje")).toHaveTextContent(
      "30 % del total · Saldo: S/ 700.00",
    );
    expect(within(dialog).getByLabelText("Contacto")).toHaveTextContent(
      "Luis Rojas",
    );

    await user.click(within(dialog).getByLabelText("Tipo de pago"));
    await user.click(await screen.findByRole("option", { name: "Al contado" }));
    expect(
      within(dialog).queryByLabelText("Adelanto (S/) (opcional)"),
    ).toBeNull();
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

  it("con pagos registrados el adelanto (ya cobrado) y el tipo de pago no se cambian", async () => {
    mocks.updateRestoration.mockReset().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <EditRestorationDialog
        restorationId="r1"
        initial={{
          contactId: null,
          paymentType: "a_cuenta",
          depositAmountCents: 10000,
          totalCents: 0,
          pricesIncludeIgv: true,
          notes: "",
        }}
        hasOrder={false}
        hasPayments
        contacts={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog");
    const deposit = within(dialog).getByLabelText("Adelanto (S/) (opcional)");
    expect(deposit).toBeDisabled();
    expect(deposit).toHaveValue("100.00");
    expect(
      within(dialog).getByText(
        "Con pagos registrados ya no se cambia: los cobros van en Pagos.",
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );
    // Se envía el mismo adelanto: la BD lo deja igual.
    expect(mocks.updateRestoration).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({
        paymentType: "a_cuenta",
        depositAmount: "100.00",
      }),
    );
  });
});
