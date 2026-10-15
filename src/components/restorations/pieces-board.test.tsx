import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";

import { PiecesBoard, type PieceEditing } from "./pieces-board";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
}));

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: (...a: unknown[]) => mocks.change(...a),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
  changePiecePrice: vi.fn(),
}));
vi.mock("@/server/restorations/actions", () => ({}));
vi.mock("@/server/sale-price-actions", () => ({
  setPieceSalePrice: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/service-cost-actions", () => ({
  setPieceServiceCost: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  mocks.change.mockReset();
  mocks.change.mockResolvedValue({ ok: true });
});

const piece = (n: number, patch: Partial<PieceDetail> = {}): PieceDetail => ({
  id: `p${n}`,
  number: n,
  code: `RES-00001-${n}`,
  status: "registrada",
  location: "sin_enviar",
  urgent: false,
  readyForDelivery: false,
  description: `Pieza ${n}`,
  measure: "",
  materialName: "",
  serviceName: "",
  weightGrams: null,
  workshopId: null,
  workshopName: null,
  materialId: null,
  serviceId: null,
  notes: "",
  arrivedAt: null,
  createdAt: "2026-10-01T15:00:00Z",
  deliveredAt: null,
  returnedAt: null,
  priceCents: null,
  ...patch,
});

const editingFor = (
  pieces: PieceDetail[],
  priceChange: Record<string, boolean> = {},
): PieceEditing => ({
  editable: Object.fromEntries(
    pieces.map((p) => [p.id, ["description", "notes", "price"] as const]),
  ),
  priceHint: "",
  priceChange,
  materials: [],
  services: [],
});

const renderBoard = (
  pieces: PieceDetail[] = [piece(1), piece(2), piece(3)],
  {
    role = "ventas",
    editing = null,
    photos,
  }: {
    role?: AppRole;
    editing?: PieceEditing | null;
    photos?: Record<string, string>;
  } = {},
) =>
  render(
    <PiecesBoard
      restorationId="r1"
      role={role}
      workshops={[]}
      editing={editing}
      pieces={pieces}
      photos={photos}
    />,
  );

const bar = () =>
  screen.getByRole("region", { name: "Acciones para las piezas elegidas" });

const openMenu = async (
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) => {
  await user.click(
    within(screen.getByTestId(`pieza-${code}`)).getByRole("button", {
      name: `Acciones de ${code}`,
    }),
  );
  return screen.findByRole("menu");
};

describe("PiecesBoard: cambio de estado masivo", () => {
  it("empieza con todas las piezas elegidas y el selector de estado visible", () => {
    renderBoard();
    expect(bar()).toHaveTextContent("3 piezas elegidas");
    expect(screen.getByLabelText("Elegir RES-00001-1")).toBeChecked();
    expect(screen.getByLabelText("Elegir RES-00001-3")).toBeChecked();
    expect(screen.getByLabelText("Elegir todas las piezas")).toBeChecked();
    // Ancla de cada pieza, a la que lleva el kanban del detalle.
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveAttribute(
      "id",
      "pieza-p2",
    );
    expect(within(bar()).getByLabelText("Cambiar estado a…")).toBeEnabled();
    expect(
      within(bar()).getByRole("button", { name: "Aplicar a 3 piezas" }),
    ).toBeDisabled();
  });

  it("desmarcar una pieza actualiza el conteo y 'todas' la vuelve a marcar", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByLabelText("Elegir RES-00001-2"));
    expect(bar()).toHaveTextContent("2 piezas elegidas");
    expect(screen.getByLabelText("Elegir todas las piezas")).not.toBeChecked();

    await user.click(screen.getByLabelText("Elegir todas las piezas"));
    expect(bar()).toHaveTextContent("3 piezas elegidas");

    await user.click(screen.getByLabelText("Elegir todas las piezas"));
    expect(bar()).toHaveTextContent("0 piezas elegidas");
    expect(within(bar()).getByLabelText("Cambiar estado a…")).toBeDisabled();
  });
});

describe("PiecesBoard: tabla como hoja de cálculo", () => {
  it("una fila por pieza con foto, datos, estado y taller", () => {
    renderBoard(
      [
        piece(1, {
          description: "Fuente ovalada",
          notes: "Golpe en el borde",
          serviceName: "Limpieza",
          materialName: "Plata",
          measure: "30 cm",
          weightGrams: 120,
          urgent: true,
          workshopName: "Taller Central",
        }),
        piece(2),
      ],
      { photos: { p1: "https://example.test/antes.jpg" } },
    );
    const table = screen.getByRole("table", { name: "Piezas de la guía" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Elegir",
      "Foto antes",
      "Pieza",
      "Descripción",
      "Precio venta",
      "Estado",
      "Taller",
      "Acciones",
    ]);

    const row = screen.getByTestId("pieza-RES-00001-1");
    expect(row.tagName).toBe("TR");
    expect(
      within(row).getByRole("img", { name: "Foto de antes de RES-00001-1" }),
    ).toHaveAttribute("src", "https://example.test/antes.jpg");
    expect(
      within(row).getByRole("link", { name: "RES-00001-1" }),
    ).toHaveAttribute("href", "/piezas/p1");
    expect(row).toHaveTextContent("Urgente");
    expect(row).toHaveTextContent("Golpe en el borde");
    expect(row).toHaveTextContent("Limpieza");
    expect(row).toHaveTextContent("Plata · 30 cm · 120 g");
    expect(row).toHaveTextContent("Registrada");
    expect(row).toHaveTextContent("Taller Central");

    const other = screen.getByTestId("pieza-RES-00001-2");
    expect(other).toHaveTextContent("Sin foto de antes");
    expect(other).toHaveTextContent("Sin taller");
  });
});

describe("PiecesBoard: menú «Acciones» de cada pieza", () => {
  it("lista las acciones del rol y «Ver detalle»", async () => {
    const user = userEvent.setup();
    renderBoard();
    const menu = await openMenu(user, "RES-00001-1");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual([
      "Marcar llegada a tienda",
      "Poner en consulta",
      "Aprobar",
      "Anular",
      "Ver detalle",
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: "Ver detalle" }),
    ).toHaveAttribute("href", "/piezas/p1");
    // Ventas sin edición: no hay «Editar».
    expect(within(menu).queryByRole("menuitem", { name: "Editar" })).toBeNull();
  });

  it("aparta los cierres en su grupo, en rojo", async () => {
    const user = userEvent.setup();
    renderBoard();
    const menu = await openMenu(user, "RES-00001-1");
    const [estado, cierre] = within(menu).getAllByRole("group");
    expect(estado).toHaveTextContent("Cambiar estado");
    expect(
      within(estado!).getByRole("menuitem", { name: "Aprobar" }),
    ).not.toHaveAttribute("data-variant", "destructive");
    expect(cierre).toHaveTextContent("Cerrar la pieza");
    expect(
      within(cierre!).getByRole("menuitem", { name: "Anular" }),
    ).toHaveAttribute("data-variant", "destructive");
  });

  it("el paso siguiente está a la vista como botón", async () => {
    const user = userEvent.setup();
    renderBoard();
    const row = screen.getByTestId("pieza-RES-00001-1");
    await user.click(
      within(row).getByRole("button", { name: "Aprobar: RES-00001-1" }),
    );
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith(
        "r1",
        ["p1"],
        "aprobada",
        null,
        null,
      ),
    );
  });

  it("«Aprobar» cambia el estado al instante", async () => {
    const user = userEvent.setup();
    renderBoard();
    await openMenu(user, "RES-00001-1");
    await user.click(screen.getByRole("menuitem", { name: "Aprobar" }));
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith(
        "r1",
        ["p1"],
        "aprobada",
        null,
        null,
      ),
    );
  });

  it("«Anular» abre la confirmación con el foco dentro del diálogo", async () => {
    const user = userEvent.setup();
    renderBoard();
    await openMenu(user, "RES-00001-2");
    await user.click(screen.getByRole("menuitem", { name: "Anular" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Anular: RES-00001-2",
    });
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it("«Editar» abre el diálogo de la pieza", async () => {
    const user = userEvent.setup();
    const pieces = [piece(1), piece(2)];
    renderBoard(pieces, { role: "admin", editing: editingFor(pieces) });
    await openMenu(user, "RES-00001-1");
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(
      await screen.findByRole("dialog", { name: "Editar RES-00001-1" }),
    ).toBeVisible();
  });

  it("«Cambiar precio» aparece con la orden creada y abre su diálogo", async () => {
    const user = userEvent.setup();
    const pieces = [piece(1, { priceCents: 12_000, status: "aprobada" })];
    renderBoard(pieces, {
      role: "admin",
      editing: editingFor(pieces, { p1: true }),
    });
    await openMenu(user, "RES-00001-1");
    await user.click(screen.getByRole("menuitem", { name: "Cambiar precio" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Cambiar precio de RES-00001-1",
      }),
    ).toBeVisible();
  });
});

describe("PiecesBoard: precio de venta (D58)", () => {
  const pieces = [piece(1, { priceCents: 12_050 }), piece(2)];

  it("ventas ve el precio o «Por definir»", () => {
    renderBoard(pieces, { role: "ventas" });
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "S/ 120.50",
    );
    expect(
      within(screen.getByTestId("pieza-RES-00001-2")).getByTestId(
        "precio-sin-asignar",
      ),
    ).toHaveTextContent("Por definir");
    expect(
      screen.queryByLabelText("Precio de venta de RES-00001-2"),
    ).toBeNull();
  });

  it("el admin asigna con el lápiz de la tabla el precio por definir", async () => {
    const { setPieceSalePrice } = await import("@/server/sale-price-actions");
    const user = userEvent.setup();
    renderBoard(pieces, { role: "admin", editing: editingFor(pieces) });
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveTextContent(
      "Por definir",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Editar precio de venta de RES-00001-2",
      }),
    );
    const input = screen.getByLabelText("Precio de venta (S/)");
    expect(input).toHaveValue("");
    await user.type(input, "80");
    await user.click(screen.getByRole("button", { name: "Guardar precio" }));
    expect(setPieceSalePrice).toHaveBeenCalledWith("p2", "80");
  });

  it("con precio asignado la tabla solo muestra el monto (se cambia en «Acciones»)", () => {
    renderBoard(pieces, { role: "admin", editing: editingFor(pieces) });
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "S/ 120.50",
    );
    expect(
      screen.queryByRole("button", {
        name: "Editar precio de venta de RES-00001-1",
      }),
    ).toBeNull();
  });

  it("logística no ve la columna ni si faltan", () => {
    renderBoard(pieces, { role: "logistica" });
    expect(
      screen.queryByRole("columnheader", { name: "Precio venta" }),
    ).toBeNull();
    expect(screen.queryByTestId("precio-sin-asignar")).toBeNull();
  });
});
