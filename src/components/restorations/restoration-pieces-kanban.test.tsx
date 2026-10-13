import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { formatCents } from "@/domain/money";
import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";

import { RestorationPiecesKanban } from "./restoration-pieces-kanban";

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (n: number, patch: Partial<PieceDetail> = {}): PieceDetail => ({
  id: `p${n}`,
  number: n,
  code: `RES-00012-${n}`,
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

const pieces = [
  piece(1, {
    status: "aprobada",
    urgent: true,
    serviceName: "Limpieza",
    priceCents: 12_000,
    arrivedAt: "2026-10-02T15:00:00Z",
    location: "en_tienda",
  }),
  piece(2, {
    status: "enviada_taller",
    location: "en_taller",
    workshopId: "w1",
    workshopName: "Taller Norte",
    priceCents: 5_000,
  }),
  piece(3, { status: "anulada", location: "anulada" }),
  piece(4),
];

const renderKanban = (role: AppRole) =>
  render(
    <RestorationPiecesKanban
      restorationId="r1"
      pieces={pieces}
      role={role}
      workshops={[{ id: "w1", name: "Taller Norte" }]}
    />,
  );

const bar = () =>
  screen.queryByRole("region", { name: "Acciones para las piezas elegidas" });

describe("RestorationPiecesKanban", () => {
  it("muestra los estados en curso y, de los finales, solo los que tienen piezas", () => {
    renderKanban("ventas");
    const list = screen.getByRole("list", { name: "Piezas por estado" });
    const columns = within(list)
      .getAllByRole("listitem")
      .map((c) => c.getAttribute("aria-label"));
    expect(columns).toEqual([
      "Registrada",
      "Consulta",
      "Espera respuesta cliente",
      "Aprobada",
      "Interno",
      "Observación",
      "Anulado",
    ]);
    expect(screen.getByTestId("columna-en_consulta")).toHaveTextContent(
      "Sin piezas",
    );
    expect(screen.queryByTestId("columna-entregada")).toBeNull();
  });

  it("pone cada pieza en su columna con sus datos y su enlace", () => {
    renderKanban("ventas");
    const card = within(screen.getByTestId("columna-aprobada")).getByTestId(
      "tarjeta-RES-00012-1",
    );
    expect(
      within(card).getByRole("link", { name: "RES-00012-1" }),
    ).toHaveAttribute("href", "/restauraciones/r1#pieza-p1");
    expect(card).toHaveTextContent("Pieza 1");
    expect(card).toHaveTextContent("Servicio: Limpieza");
    expect(card).toHaveTextContent("Urgente");
    expect(card).toHaveTextContent("En tienda");
    expect(card).toHaveTextContent("Sin taller");
    // Acento de pieza, como en la lista: es hija de la guía.
    expect(card).toHaveClass("border-l-4");

    const sent = within(
      screen.getByTestId("columna-enviada_taller"),
    ).getByTestId("tarjeta-RES-00012-2");
    expect(sent).toHaveTextContent("Taller Norte");
    expect(sent).not.toHaveTextContent("Urgente");
    expect(screen.getByTestId("columna-anulada")).toContainElement(
      screen.getByTestId("tarjeta-RES-00012-3"),
    );
  });

  it("muestra el precio a quien ve montos, o «Sin asignar» si aún no tiene", () => {
    renderKanban("ventas");
    expect(
      within(screen.getByTestId("tarjeta-RES-00012-1")).getByTestId("precio"),
    ).toHaveTextContent(`Precio: ${formatCents(12_000)}`);
    expect(
      within(screen.getByTestId("tarjeta-RES-00012-4")).getByTestId("precio"),
    ).toHaveTextContent("Sin asignar");
  });

  it("no muestra precios a logística", () => {
    renderKanban("logistica");
    expect(screen.queryAllByTestId("precio")).toHaveLength(0);
    expect(screen.queryByText("Sin asignar")).toBeNull();
  });

  it("al elegir piezas aparece la barra de acciones masivas", async () => {
    const user = userEvent.setup();
    renderKanban("ventas");
    expect(bar()).toBeNull();
    await user.click(screen.getByLabelText("Elegir RES-00012-4"));
    expect(bar()).toHaveTextContent("1 pieza elegida");
    await user.click(
      within(bar()!).getByRole("button", { name: "Quitar selección" }),
    );
    expect(bar()).toBeNull();
    expect(screen.getByLabelText("Elegir RES-00012-4")).not.toBeChecked();
  });
});
