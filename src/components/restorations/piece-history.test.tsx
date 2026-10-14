import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PieceDetail } from "@/server/restorations/queries";

import {
  LogisticsPieceSummary,
  PieceTimelineStrip,
  RestorationStatusSummary,
} from "./piece-history";

const piece = { id: "p1", code: "RES-00001-1" } as PieceDetail;

describe("LogisticsPieceSummary", () => {
  it("muestra los días en taller y la última observación", () => {
    render(
      <LogisticsPieceSummary
        info={{
          workshopDays: 3,
          workshopOngoing: true,
          lastObservation: "Falta pulir",
        }}
      />,
    );
    expect(screen.getByText(/3 días \(en curso\)/)).toBeInTheDocument();
    expect(screen.getByText("Falta pulir")).toBeInTheDocument();
  });

  it("sin observación ni taller muestra 0 días", () => {
    render(
      <LogisticsPieceSummary
        info={{
          workshopDays: 1,
          workshopOngoing: false,
          lastObservation: null,
        }}
      />,
    );
    expect(screen.getByText(/1 día$/)).toBeInTheDocument();
    expect(screen.queryByText(/Última observación/)).toBeNull();
  });
});

describe("RestorationStatusSummary", () => {
  it("lista los cambios del más reciente al más antiguo con la pieza", () => {
    render(
      <RestorationStatusSummary
        pieces={[piece]}
        events={[
          {
            pieceId: "p1",
            event: "estado",
            at: "2026-10-01T15:00:00Z",
            fromStatus: null,
            toStatus: "registrada",
            actorName: null,
            note: null,
          },
          {
            pieceId: "p1",
            event: "estado",
            at: "2026-10-02T15:00:00Z",
            fromStatus: "registrada",
            toStatus: "aprobada",
            actorName: "Vera Ventas",
            note: "Aceptó por WhatsApp",
          },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("RES-00001-1: Registrada → Aprobada");
    expect(items[0]).toHaveTextContent("Vera Ventas");
    expect(items[0]).toHaveTextContent("Aceptó por WhatsApp");
    expect(items[1]).toHaveTextContent("Sistema");
  });

  it("sin cambios lo indica", () => {
    render(<RestorationStatusSummary pieces={[]} events={[]} />);
    expect(screen.getByText("Sin cambios de estado.")).toBeInTheDocument();
  });
});

describe("PieceTimelineStrip", () => {
  it("está siempre a la vista, en horizontal, con el título", () => {
    render(
      <PieceTimelineStrip
        piece={
          {
            ...piece,
            status: "aprobada",
            createdAt: "2026-10-01T15:00:00Z",
            deliveredAt: null,
          } as PieceDetail
        }
        events={[
          {
            pieceId: "p1",
            event: "estado",
            at: "2026-10-01T15:00:00Z",
            fromStatus: null,
            toStatus: "registrada",
            actorName: null,
            note: null,
          },
          {
            pieceId: "p1",
            event: "estado",
            at: "2026-10-02T15:00:00Z",
            fromStatus: "registrada",
            toStatus: "aprobada",
            actorName: "Vera Ventas",
            note: null,
          },
        ]}
        now={new Date("2026-10-03T15:00:00Z")}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Línea de tiempo" }),
    ).toBeVisible();
    expect(screen.getByTestId("linea-tiempo").tagName).toBe("SECTION");
    const steps = screen.getAllByTestId("evento");
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    // Usa la insignia del estado, así comparte sus colores.
    expect(steps[1]!.querySelector('[data-status="aprobada"]')).not.toBeNull();
  });
});
