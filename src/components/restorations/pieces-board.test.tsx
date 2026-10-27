import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";

import { PiecesBoard, type PieceEditing } from "./pieces-board";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  urgent: vi.fn(),
}));

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: (...a: unknown[]) => mocks.change(...a),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
  changePiecePrice: vi.fn(),
  setPiecesUrgent: (...a: unknown[]) => mocks.urgent(...a),
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
  mocks.urgent.mockReset();
  mocks.urgent.mockResolvedValue({ ok: true });
});

const piece = (n: number, patch: Partial<PieceDetail> = {}): PieceDetail => ({
  id: `p${n}`,
  number: n,
  code: `RES-00001-${n}`,
  status: "registrada",
  location: "sin_enviar",
  urgent: false,
  estimatedDeliveryDate: null,
  workshopDeliveryDate: null,
  readyForDelivery: false,
  description: `Pieza ${n}`,
  measure: "",
  materialName: "",
  serviceName: "",
  weightGrams: null,
  workshopId: null,
  workshopName: null,
  materialIds: [],
  serviceIds: [],
  notes: "",
  arrivedAt: null,
  createdAt: "2026-10-01T15:00:00Z",
  deliveredAt: null,
  returnedAt: null,
  priceCents: null,
  quantity: 1,
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

const setWorkshopDate = (value: string) =>
  fireEvent.change(
    screen.getByLabelText("Fecha estimada de entrega del taller (opcional)"),
    { target: { value } },
  );

const setDeliveryDate = (value: string) =>
  fireEvent.change(
    screen.getByLabelText("Fecha estimada de entrega al cliente", {
      selector: "input",
    }),
    {
      target: { value },
    },
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
  it("empieza con todas las piezas elegidas y «Cambiar estado» a la vista", () => {
    renderBoard();
    expect(bar()).toHaveTextContent("3 de 3 seleccionadas");
    expect(screen.getByLabelText("Elegir RES-00001-1")).toBeChecked();
    expect(screen.getByLabelText("Elegir RES-00001-3")).toBeChecked();
    expect(screen.getByLabelText("Elegir todas las piezas")).toBeChecked();
    // Ancla de cada pieza, a la que lleva el kanban del detalle.
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveAttribute(
      "id",
      "pieza-p2",
    );
    expect(
      within(bar()).getByRole("button", { name: "Cambiar estado de 3 piezas" }),
    ).toBeEnabled();
  });

  it("desmarcar una pieza actualiza el conteo y 'todas' la vuelve a marcar", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByLabelText("Elegir RES-00001-2"));
    expect(bar()).toHaveTextContent("2 de 3 seleccionadas");
    expect(screen.getByLabelText("Elegir todas las piezas")).not.toBeChecked();

    await user.click(screen.getByLabelText("Elegir todas las piezas"));
    expect(bar()).toHaveTextContent("3 de 3 seleccionadas");

    await user.click(screen.getByLabelText("Elegir todas las piezas"));
    expect(bar()).toHaveTextContent("0 de 3 seleccionadas");
    expect(
      within(bar()).getByRole("button", { name: "Cambiar estado" }),
    ).toBeDisabled();
  });

  it("«Quitar selección» desmarca todas (no las vuelve a elegir)", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(
      within(bar()).getByRole("button", { name: "Quitar selección" }),
    );
    expect(bar()).toHaveTextContent("0 de 3 seleccionadas");
    expect(screen.getByLabelText("Elegir RES-00001-1")).not.toBeChecked();
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

  it("ventas ve el precio y asigna el que falta", () => {
    renderBoard(pieces, { role: "ventas" });
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "S/ 120.50",
    );
    expect(
      screen.getByRole("button", {
        name: "Editar precio de venta de RES-00001-2",
      }),
    ).toBeInTheDocument();
  });

  it("una guía interna u observada no muestra la columna de precio", () => {
    render(
      <PiecesBoard
        restorationId="r1"
        role="admin"
        workshops={[]}
        editing={null}
        pieces={pieces}
        guideKind="interno"
      />,
    );
    expect(
      screen.queryByRole("columnheader", { name: "Precio venta" }),
    ).toBeNull();
    expect(screen.queryByText("Por definir")).toBeNull();
  });

  it("muestra siempre la cantidad junto al código, también con una", () => {
    renderBoard([piece(1), piece(2, { quantity: 4 })]);
    expect(
      within(screen.getByTestId("pieza-RES-00001-2")).getByTestId("cantidad"),
    ).toHaveTextContent("×4");
    expect(
      within(screen.getByTestId("pieza-RES-00001-1")).getByTestId("cantidad"),
    ).toHaveTextContent("×1");
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
    const input = screen.getByLabelText("Precio de venta unitario (S/)");
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

  it("logística ve el precio y asigna con el lápiz el que falta (sin formulario de edición)", async () => {
    const { setPieceSalePrice } = await import("@/server/sale-price-actions");
    vi.mocked(setPieceSalePrice).mockClear();
    const user = userEvent.setup();
    renderBoard(pieces, { role: "logistica" });
    expect(
      screen.getByRole("columnheader", { name: "Precio venta" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "S/ 120.50",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Editar precio de venta de RES-00001-2",
      }),
    );
    await user.type(
      screen.getByLabelText("Precio de venta unitario (S/)"),
      "80",
    );
    await user.click(screen.getByRole("button", { name: "Guardar precio" }));
    expect(setPieceSalePrice).toHaveBeenCalledWith("p2", "80");
  });

  it("logística cambia con motivo el precio asignado si la orden ya existe", async () => {
    const user = userEvent.setup();
    const withOrder = [piece(1, { priceCents: 12_000, status: "aprobada" })];
    render(
      <PiecesBoard
        restorationId="r1"
        role="logistica"
        workshops={[]}
        editing={null}
        pieces={withOrder}
        hasOrder
      />,
    );
    await openMenu(user, "RES-00001-1");
    await user.click(screen.getByRole("menuitem", { name: "Cambiar precio" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Cambiar precio de RES-00001-1",
      }),
    ).toBeVisible();
  });
});

describe("PiecesBoard: urgente", () => {
  it("el rayo de la fila marca la pieza como urgente", async () => {
    const user = userEvent.setup();
    renderBoard([piece(1), piece(2)], { role: "logistica" });
    const row = screen.getByTestId("pieza-RES-00001-1");
    await user.click(
      within(row).getByRole("button", { name: "Marcar como urgente" }),
    );
    // Pide la fecha de entrega antes de marcarla.
    setDeliveryDate("2030-01-15");
    await user.click(screen.getByRole("button", { name: "Marcar urgente" }));
    await waitFor(() =>
      expect(mocks.urgent).toHaveBeenCalledWith(["p1"], true, "2030-01-15", {
        workshopDeliveryDate: null,
        keepWorkshopDate: false,
      }),
    );
  });

  it("una pieza urgente muestra su fecha de entrega y, sin ella, deja colocarla", async () => {
    const user = userEvent.setup();
    renderBoard(
      [
        piece(1, { urgent: true, estimatedDeliveryDate: "2030-01-15" }),
        piece(2, { urgent: true }),
      ],
      { role: "ventas" },
    );
    expect(
      within(screen.getByTestId("pieza-RES-00001-1")).getByTestId(
        "fecha-entrega",
      ),
    ).toHaveTextContent("Entrega 15 ene 2030");
    await user.click(
      screen.getByRole("button", {
        name: "Colocar la fecha de entrega de RES-00001-2",
      }),
    );
    setDeliveryDate("2030-02-01");
    await user.click(screen.getByRole("button", { name: "Guardar fecha" }));
    await waitFor(() =>
      expect(mocks.urgent).toHaveBeenCalledWith(["p2"], true, "2030-02-01", {
        workshopDeliveryDate: null,
        keepWorkshopDate: false,
      }),
    );
  });

  it("en una pieza urgente el rayo la quita", async () => {
    const user = userEvent.setup();
    renderBoard([piece(1, { urgent: true })], { role: "ventas" });
    const row = screen.getByTestId("pieza-RES-00001-1");
    await user.click(
      within(row).getByRole("button", { name: "Quitar urgente" }),
    );
    expect(mocks.urgent).toHaveBeenCalledWith(["p1"], false);
  });

  it("una pieza entregada o cerrada no se marca", () => {
    renderBoard([
      piece(1, { status: "entregada" }),
      piece(2, { status: "anulada" }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Marcar como urgente" }),
    ).toBeNull();
  });

  it("la barra cambia la fecha de varias urgentes sin borrar la del taller de cada una", async () => {
    const user = userEvent.setup();
    renderBoard(
      [
        piece(1, {
          urgent: true,
          estimatedDeliveryDate: "2030-01-15",
          workshopDeliveryDate: "2030-01-10",
        }),
        piece(2, { urgent: true, estimatedDeliveryDate: "2030-01-15" }),
      ],
      { role: "admin" },
    );
    await user.click(
      within(bar()).getByRole("button", { name: "Fecha de entrega" }),
    );
    expect(
      screen.getByLabelText("Fecha estimada de entrega del taller (opcional)"),
    ).toHaveValue("");
    expect(
      screen.getByText(
        "En blanco: cada pieza conserva la fecha del taller que tenga.",
      ),
    ).toBeInTheDocument();
    setDeliveryDate("2030-01-25");
    await user.click(screen.getByRole("button", { name: "Guardar fecha" }));
    await waitFor(() =>
      expect(mocks.urgent).toHaveBeenCalledWith(
        ["p1", "p2"],
        true,
        "2030-01-25",
        {
          workshopDeliveryDate: null,
          keepWorkshopDate: true,
        },
      ),
    );
  });

  it("una urgente muestra también la fecha del taller", () => {
    renderBoard(
      [
        piece(1, {
          urgent: true,
          estimatedDeliveryDate: "2030-01-15",
          workshopDeliveryDate: "2030-01-10",
        }),
      ],
      { role: "ventas" },
    );
    expect(screen.getByTestId("fecha-entrega")).toHaveTextContent(
      "Entrega 15 ene 2030 · Taller 10 ene 2030",
    );
  });

  it("la barra marca (con fecha de entrega), cambia la fecha o quita «Urgente»", async () => {
    const user = userEvent.setup();
    renderBoard(
      [
        piece(1),
        piece(2, { urgent: true, estimatedDeliveryDate: "2030-01-15" }),
      ],
      { role: "admin" },
    );
    // Marca solo las que aún no son urgentes, con la fecha pedida.
    await user.click(
      within(bar()).getByRole("button", { name: "Marcar urgente" }),
    );
    setDeliveryDate("2030-01-10");
    await user.click(screen.getByRole("button", { name: "Marcar urgente" }));
    await waitFor(() =>
      expect(mocks.urgent).toHaveBeenCalledWith(["p1"], true, "2030-01-10", {
        workshopDeliveryDate: null,
        keepWorkshopDate: false,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Las urgentes cambian de fecha; el diálogo abre con la que tienen.
    await user.click(
      within(bar()).getByRole("button", { name: "Fecha de entrega" }),
    );
    expect(
      screen.getByLabelText("Fecha estimada de entrega al cliente", {
        selector: "input",
      }),
    ).toHaveValue("2030-01-15");
    setDeliveryDate("2030-01-20");
    setWorkshopDate("2030-01-18");
    await user.click(screen.getByRole("button", { name: "Guardar fecha" }));
    await waitFor(() =>
      expect(mocks.urgent).toHaveBeenCalledWith(["p2"], true, "2030-01-20", {
        workshopDeliveryDate: "2030-01-18",
        keepWorkshopDate: false,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(
      within(bar()).getByRole("button", { name: "Quitar urgente" }),
    );
    expect(mocks.urgent).toHaveBeenCalledWith(["p2"], false);
  });
});
