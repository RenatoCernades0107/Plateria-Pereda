import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PIECE_STATUS_LABELS,
  PIECE_STATUSES,
} from "@/domain/piece-state-machine";
import {
  PIECE_LOCATION_LABELS,
  PIECE_LOCATIONS,
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
} from "@/domain/restoration-status";

import { MoneySummary } from "./money-summary";
import {
  LocationBadge,
  PieceStatusBadge,
  RestorationStatusBadge,
} from "./status-badges";
import { Timeline, type TimelineEvent } from "./timeline";

describe("insignias", () => {
  it.each(PIECE_STATUSES)("estado de pieza %s", (status) => {
    render(<PieceStatusBadge status={status} />);
    const badge = screen.getByText(PIECE_STATUS_LABELS[status]);
    expect(badge).toHaveAttribute("data-status", status);
  });

  it.each(RESTORATION_STATUSES)("estado de restauración %s", (status) => {
    render(<RestorationStatusBadge status={status} />);
    expect(screen.getByText(RESTORATION_STATUS_LABELS[status])).toHaveAttribute(
      "data-status",
      status,
    );
  });

  it.each(PIECE_LOCATIONS)("ubicación %s", (location) => {
    render(<LocationBadge location={location} />);
    expect(screen.getByText(PIECE_LOCATION_LABELS[location])).toHaveAttribute(
      "data-location",
      location,
    );
  });

  it("distingue lo observado y lo anulado sin depender solo del color", () => {
    render(
      <>
        <PieceStatusBadge status="observada" />
        <PieceStatusBadge status="anulada" />
        <RestorationStatusBadge status="anulada" />
      </>,
    );
    expect(screen.getByText("Observada")).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    for (const badge of screen.getAllByText("Anulada")) {
      expect(badge).toHaveClass("line-through");
    }
  });
});

describe("MoneySummary", () => {
  it("muestra total, pagado y saldo en soles", () => {
    render(<MoneySummary totalCents={155_050} paidCents={77_525} />);
    expect(screen.getByTestId("monto-total")).toHaveTextContent("S/ 1,550.50");
    expect(screen.getByTestId("monto-pagado")).toHaveTextContent("S/ 775.25");
    expect(screen.getByTestId("monto-saldo")).toHaveTextContent("S/ 775.25");
    expect(screen.getByText("Saldo")).toBeInTheDocument();
  });

  it("sin pagos el saldo es el total; pagado todo, saldo 0", () => {
    const { rerender } = render(
      <MoneySummary totalCents={10_000} paidCents={0} />,
    );
    expect(screen.getByTestId("monto-saldo")).toHaveTextContent("S/ 100.00");
    rerender(<MoneySummary totalCents={10_000} paidCents={10_000} />);
    expect(screen.getByTestId("monto-saldo")).toHaveTextContent("S/ 0.00");
  });

  it("si se pagó de más lo muestra a favor del cliente", () => {
    render(<MoneySummary totalCents={10_000} paidCents={12_000} />);
    expect(screen.getByText("A favor del cliente")).toBeInTheDocument();
    expect(screen.getByTestId("monto-saldo")).toHaveTextContent("S/ 20.00");
  });
});

// 10:00 en Lima (UTC−5).
const at = (day: string) => `2026-10-${day}T15:00:00Z`;

const EVENTS: TimelineEvent[] = [
  // Desordenados a propósito: el componente los ordena por fecha.
  {
    at: at("05"),
    fromStatus: "recibida",
    toStatus: "enviada_taller",
    actorName: "Luis Logística",
    note: null,
  },
  {
    at: at("01"),
    fromStatus: null,
    toStatus: "registrada",
    actorName: "Ana Ventas",
    note: null,
  },
  {
    at: at("02"),
    fromStatus: "registrada",
    toStatus: "en_consulta",
    actorName: null,
    note: "¿Se puede soldar el asa?",
  },
];

describe("Timeline", () => {
  it("muestra los eventos en orden con fecha, usuario y nota", () => {
    render(
      <Timeline
        events={EVENTS}
        piece={{
          status: "enviada_taller",
          registeredAt: at("01"),
          deliveredAt: null,
        }}
        now={new Date(at("08"))}
      />,
    );
    const items = screen.getAllByTestId("evento");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Registrada");
    expect(items[0]).toHaveTextContent("01/10/2026 10:00");
    expect(items[0]).toHaveTextContent("Ana Ventas");
    expect(items[1]).toHaveTextContent("En consulta");
    expect(items[1]).toHaveTextContent("desde Registrada");
    expect(items[1]).toHaveTextContent("Sistema");
    expect(items[1]).toHaveTextContent("¿Se puede soldar el asa?");
    expect(
      within(items[2]!).getByText("Enviada al taller"),
    ).toBeInTheDocument();
    expect(items[2]).toHaveTextContent("Luis Logística");
  });

  it("cuenta los días en curso hasta ahora", () => {
    render(
      <Timeline
        events={EVENTS}
        piece={{
          status: "enviada_taller",
          registeredAt: at("01"),
          deliveredAt: null,
        }}
        now={new Date(at("08"))}
      />,
    );
    expect(screen.getByTestId("dias-taller")).toHaveTextContent(
      "3 días (en curso)",
    );
    expect(screen.getByTestId("dias-cumplimiento")).toHaveTextContent(
      "7 días (en curso)",
    );
  });

  it("al entregar los días quedan cerrados", () => {
    const events: TimelineEvent[] = [
      ...EVENTS,
      {
        at: at("06"),
        fromStatus: "enviada_taller",
        toStatus: "devuelta_taller",
        actorName: "Luis Logística",
        note: null,
      },
      {
        at: at("09"),
        fromStatus: "devuelta_taller",
        toStatus: "entregada",
        actorName: "Ana Ventas",
        note: null,
      },
    ];
    render(
      <Timeline
        events={events}
        piece={{
          status: "entregada",
          registeredAt: at("01"),
          deliveredAt: at("09"),
        }}
        now={new Date(at("20"))}
      />,
    );
    expect(screen.getByTestId("dias-taller")).toHaveTextContent(/^1 día$/);
    expect(screen.getByTestId("dias-cumplimiento")).toHaveTextContent(
      /^8 días$/,
    );
  });

  it("una pieza anulada no tiene días de cumplimiento", () => {
    render(
      <Timeline
        events={[]}
        piece={{ status: "anulada", registeredAt: at("01"), deliveredAt: null }}
        now={new Date(at("08"))}
      />,
    );
    expect(screen.getByTestId("dias-cumplimiento")).toHaveTextContent("—");
    expect(screen.getByTestId("dias-taller")).toHaveTextContent(/^0 días$/);
    expect(screen.getByText("Sin cambios de estado.")).toBeInTheDocument();
  });
});
