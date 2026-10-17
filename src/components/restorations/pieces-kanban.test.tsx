import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BoardPiece } from "@/server/restorations/queries";

import type { StatusPiece } from "./piece-status-actions";
import { PiecesKanban } from "./pieces-kanban";

vi.mock("@/server/payments/actions", () => ({
  approveWithPayment: vi.fn(),
  deliverWithBalance: vi.fn(),
}));
vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
  sendPiecesToWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SENT = "2026-10-02T15:00:00Z";

/** Por defecto, Aprobada en el taller (las fechas las trae la consulta). */
const piece = (
  n: number,
  patch: Partial<BoardPiece & StatusPiece> = {},
): BoardPiece =>
  ({
    id: `p${n}`,
    code: `RES-00001-${n}`,
    restorationId: "r1",
    restorationCode: "RES-00001",
    clientName: "María Fernández Rojas",
    description: `Pieza ${n}`,
    status: "aprobada",
    location: "en_taller",
    urgent: false,
    readyForDelivery: false,
    returnedAt: null,
    workshopId: "w1",
    workshopName: "Taller Huamán",
    arrivedAt: "2026-10-01T15:00:00Z",
    firstSentAt: SENT,
    lastSentAt: SENT,
    lastReturnedAt: null,
    workshopDays: 0,
    workshopOngoing: false,
    lastObservation: null,
    serviceName: "",
    materialName: "",
    measure: "",
    weightGrams: null,
    serviceCostCents: null,
    priceCents: null,
    hasOrder: false,
    photoUrl: null,
    statusDays: 0,
    quantity: 1,
    locationSince: SENT,
    locationDays: 0,
    toReturn: false,
    ...patch,
  }) as BoardPiece;

const renderKanban = (pieces: BoardPiece[]) =>
  render(
    <PiecesKanban
      pieces={pieces}
      role="admin"
      workshops={[{ id: "w1", name: "Taller Huamán" }]}
    />,
  );

describe("PiecesKanban: tiempos de la tarjeta", () => {
  it("muestra los días en el estado y en el taller como datos separados", () => {
    renderKanban([piece(1, { statusDays: 10, workshopDays: 9 })]);
    const row = within(screen.getByTestId("tarjeta-RES-00001-1")).getByTestId(
      "tiempos-pieza",
    );
    const age = within(row).getByTestId("dias-en-estado");
    const workshop = within(row).getByTestId("dias-en-taller");
    expect(age).toHaveTextContent("10 días en este estado");
    expect(age).toHaveAttribute("data-tone", "attention");
    expect(workshop).toHaveTextContent(/^9 días en taller$/);
    expect(row).toHaveClass("flex", "flex-wrap");
  });

  it("resalta la pieza con muchos días en el taller", () => {
    renderKanban([
      piece(1, { statusDays: 2, workshopDays: 30, workshopOngoing: true }),
    ]);
    const workshop = screen.getByTestId("dias-en-taller");
    expect(workshop).toHaveTextContent("30 días en taller (en curso)");
    expect(workshop).toHaveClass("text-destructive");
    expect(
      within(workshop).getByLabelText("Muchos días en el taller"),
    ).toBeInTheDocument();
  });

  it("sin días en taller solo muestra los días en el estado", () => {
    renderKanban([piece(1, { status: "registrada", location: "sin_enviar" })]);
    expect(screen.getByTestId("dias-en-estado")).toHaveTextContent(
      "Hoy en este estado",
    );
    expect(screen.queryByTestId("dias-en-taller")).not.toBeInTheDocument();
  });
});

describe("PiecesKanban: revisión en taller", () => {
  it("el menú de la tarjeta ofrece llevar a revisar y, en revisión, «Volvió de revisión»", async () => {
    const user = userEvent.setup();
    renderKanban([
      piece(1, {
        status: "en_consulta",
        location: "sin_enviar",
        arrivedAt: "2026-10-01T15:00:00Z",
      }),
      piece(2, {
        status: "en_espera",
        location: "en_taller",
        arrivedAt: "2026-10-01T15:00:00Z",
        reviewSentAt: "2026-10-02T15:00:00Z",
        reviewReturnedAt: null,
      }),
    ]);
    await user.click(
      screen.getByRole("button", { name: "Mover RES-00001-1 a…" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Llevar al taller a revisar" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "Mover RES-00001-2 a…" }),
    );
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    // En revisión no se rechaza ni se anula hasta que vuelve.
    expect(items).toEqual(["Aprobada", "Volvió de revisión"]);
  });
});

describe("PiecesKanban: columnas por ubicación", () => {
  it("«En restauración» y «Lista para entregar» agrupan las Aprobadas por ubicación", () => {
    renderKanban([
      piece(1),
      piece(2, {
        location: "en_tienda",
        readyForDelivery: true,
        lastReturnedAt: "2026-10-04T15:00:00Z",
      }),
      piece(3, {
        location: "sin_enviar",
        firstSentAt: null,
        lastSentAt: null,
      }),
    ]);
    expect(screen.getByTestId("columna-en_restauracion")).toContainElement(
      screen.getByTestId("tarjeta-RES-00001-1"),
    );
    expect(screen.getByTestId("columna-lista_entregar")).toContainElement(
      screen.getByTestId("tarjeta-RES-00001-2"),
    );
    expect(screen.getByTestId("columna-aprobada")).toContainElement(
      screen.getByTestId("tarjeta-RES-00001-3"),
    );
    expect(screen.queryByTestId("columna-enviada_taller")).toBeNull();
  });

  it("la tarjeta en el taller ofrece «Recibir del taller»; la que no fue, «Enviar al taller»", async () => {
    const user = userEvent.setup();
    renderKanban([
      piece(1),
      piece(2, { location: "sin_enviar", firstSentAt: null, lastSentAt: null }),
    ]);
    await user.click(
      screen.getByRole("button", { name: "Mover RES-00001-1 a…" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Recibir del taller" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "Mover RES-00001-2 a…" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Enviar al taller" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Enviar al taller: RES-00001-2",
      }),
    ).toBeVisible();
  });
});
