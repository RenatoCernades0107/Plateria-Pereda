import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PiecesBulkBar } from "./pieces-bulk-bar";
import type { StatusPiece } from "./piece-status-actions";

const actions = vi.hoisted(() => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
  sendPiecesToWorkshop: vi.fn(),
}));
vi.mock("@/server/restorations/status-actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ARRIVED = "2026-10-01T15:00:00Z";
const piece: StatusPiece = {
  id: "p1",
  code: "RES-00001-1",
  status: "aprobada",
  location: "sin_enviar",
  arrivedAt: ARRIVED,
  workshopId: null,
  readyForDelivery: false,
  returnedAt: null,
  urgent: false,
};
const second = { ...piece, id: "p2", code: "RES-00001-2" };
const workshops = [{ id: "w1", name: "Taller Central" }];

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  Object.values(actions).forEach((fn) => fn.mockResolvedValue({ ok: true }));
});

const renderBar = (
  chosen: StatusPiece[],
  props: Partial<React.ComponentProps<typeof PiecesBulkBar>> = {},
) =>
  render(
    <PiecesBulkBar
      restorationId="r1"
      chosen={chosen}
      role="admin"
      workshops={workshops}
      onDone={() => {}}
      {...props}
    />,
  );

describe("PiecesBulkBar · Asignar taller (D60)", () => {
  it("logística y el admin asignan el taller; ventas no", () => {
    for (const role of ["admin", "logistica", "ventas"] as const) {
      const { unmount } = renderBar([piece], { role });
      const button = screen.queryByRole("button", { name: /Asignar taller/ });
      if (role === "ventas") expect(button).toBeNull();
      else expect(button).toBeInTheDocument();
      unmount();
    }
  });

  it("elige el taller en un menú y lo asigna a todas", async () => {
    const user = userEvent.setup();
    renderBar([piece, second]);
    await user.click(screen.getByRole("button", { name: /Asignar taller/ }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Taller Central" }),
    );
    expect(actions.assignWorkshop).toHaveBeenCalledWith(
      "r1",
      ["p1", "p2"],
      "w1",
    );
  });

  it("no cambia el taller de una pieza en el taller: deshabilitado con el motivo", () => {
    renderBar([
      piece,
      {
        ...second,
        location: "en_taller",
        workshopId: "w1",
        firstSentAt: ARRIVED,
        lastSentAt: ARRIVED,
      },
    ]);
    const button = screen.getByRole("button", { name: /Asignar taller/ });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute(
      "title",
      expect.stringMatching(/en el taller/),
    );
  });
});

describe("PiecesBulkBar · barra de la guía", () => {
  it("cuenta 'N de M seleccionadas' y 'Quitar selección' llama a onClear", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar([piece, second], { alwaysVisible: true, total: 3, onClear });
    expect(screen.getByText("2 de 3 seleccionadas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("siempre visible sin piezas elegidas: 'Cambiar estado' deshabilitado", () => {
    renderBar([], { alwaysVisible: true, total: 3 });
    expect(screen.getByText("0 de 3 seleccionadas")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cambiar estado" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Quitar selección" }),
    ).toBeNull();
  });

  it("sin la opción, no se muestra sin piezas elegidas", () => {
    const { container } = renderBar([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("'Cambiar estado' abre un menú con los cambios comunes, los cierres aparte", async () => {
    const user = userEvent.setup();
    renderBar([
      { ...piece, status: "en_espera" },
      { ...second, status: "en_espera" },
    ]);
    await user.click(
      screen.getByRole("button", { name: "Cambiar estado de 2 piezas" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Aprobar" }),
    ).toBeInTheDocument();
    expect(within(menu).getByText("Cerrar las piezas")).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Aprobar" }));
    expect(actions.changePieceStatus).toHaveBeenCalledWith(
      "r1",
      ["p1", "p2"],
      "aprobada",
      null,
      null,
    );
  });

  it("sin cambio común, 'Cambiar estado' queda deshabilitado con el motivo", () => {
    renderBar([piece, { ...second, status: "anulada" }]);
    const button = screen.getByRole("button", {
      name: "Cambiar estado de 2 piezas",
    });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute(
      "title",
      expect.stringMatching(/no comparten un cambio de estado/),
    );
  });
});

describe("PiecesBulkBar · acciones de ubicación", () => {
  it("'Enviar al taller' es la acción principal: elige el taller y las envía", async () => {
    const user = userEvent.setup();
    renderBar([
      { ...piece, workshopId: "w1" },
      { ...second, workshopId: "w1" },
    ]);
    await user.click(screen.getByRole("button", { name: "Enviar al taller" }));
    const dialog = await screen.findByRole("dialog");
    // Propone el taller que comparten.
    expect(within(dialog).getByRole("combobox")).toHaveTextContent(
      "Taller Central",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: enviar al taller",
      }),
    );
    expect(actions.sendPiecesToWorkshop).toHaveBeenCalledWith(
      ["p1", "p2"],
      "w1",
    );
  });

  it("si solo algunas admiten la acción, el botón se deshabilita y explica por qué", () => {
    renderBar([piece, { ...second, arrivedAt: null }]);
    const send = screen.getByRole("button", { name: "Enviar al taller" });
    expect(send).toBeDisabled();
    expect(send.parentElement).toHaveAttribute(
      "title",
      "Solo 1 de las 2 piezas elegidas se pueden enviar al taller; desmarca las demás.",
    );
    expect(
      screen.getByRole("button", { name: "Marcar llegada" }),
    ).toBeDisabled();
  });

  it("recibe del taller las piezas que están allá", async () => {
    const user = userEvent.setup();
    const away = {
      ...piece,
      location: "en_taller" as const,
      workshopId: "w1",
      firstSentAt: ARRIVED,
      lastSentAt: ARRIVED,
    };
    renderBar([away, { ...away, id: "p2", code: "RES-00001-2" }]);
    expect(
      screen.queryByRole("button", { name: "Enviar al taller" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Recibir del taller" }),
    );
    expect(actions.receiveFromWorkshop).toHaveBeenCalledWith("r1", [
      "p1",
      "p2",
    ]);
  });
});
