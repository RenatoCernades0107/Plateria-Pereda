import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PieceDetail } from "@/server/restorations/queries";

import {
  LogisticsPieceSummary,
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
            at: "2026-10-01T15:00:00Z",
            fromStatus: null,
            toStatus: "registrada",
            actorName: null,
            note: null,
          },
          {
            pieceId: "p1",
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
