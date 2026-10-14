import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PIECE_STATUSES,
  PIECE_STATUS_LABELS,
} from "@/domain/piece-state-machine";

import {
  PaymentStatusBadge,
  PIECE_STATUS_STYLES,
  PieceStatusBadge,
  RestorationStatusBadge,
  StatusAge,
} from "./status-badges";

describe("estado de la pieza", () => {
  it("cada estado tiene su color e icono, y siempre su texto", () => {
    const colors = PIECE_STATUSES.map(
      (s) => PIECE_STATUS_STYLES[s].className.match(/\bbg-[a-z]+-\d+/)?.[0],
    );
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(PIECE_STATUSES.length);
    for (const status of PIECE_STATUSES) {
      const { unmount } = render(<PieceStatusBadge status={status} />);
      const badge = screen.getByText(PIECE_STATUS_LABELS[status]);
      expect(badge).toHaveAttribute("data-status", status);
      expect(badge.querySelector("svg[aria-hidden]")).not.toBeNull();
      unmount();
    }
  });
});

describe("insignias con tono y progreso (S5)", () => {
  it("el estado de pago muestra su progreso sin depender del color", () => {
    render(
      <>
        <PaymentStatusBadge status="pendiente" />
        <PaymentStatusBadge status="parcial" />
        <PaymentStatusBadge status="pagado" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Sin avance" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Avance parcial" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Completo" })).toBeInTheDocument();
    expect(screen.getByText("Pagado")).toHaveAttribute("data-tone", "success");
  });

  it("Parcialmente aprobada lleva el icono de avance parcial", () => {
    render(<RestorationStatusBadge status="parcialmente_aprobada" />);
    expect(
      screen.getByRole("img", { name: "Avance parcial" }),
    ).toBeInTheDocument();
  });
});

describe("días en el estado (C5)", () => {
  it("usa el semáforo del estado", () => {
    render(<StatusAge piece={{ status: "en_espera", statusDays: 8 }} />);
    const age = screen.getByTestId("dias-en-estado");
    expect(age).toHaveAttribute("data-tone", "critical");
    expect(age).toHaveTextContent("8 días en este estado (Demorada)");
  });

  it("en versión corta dice solo los días", () => {
    render(
      <>
        <StatusAge piece={{ status: "aprobada", statusDays: 0 }} compact />
        <StatusAge piece={{ status: "aprobada", statusDays: 1 }} compact />
      </>,
    );
    expect(
      screen.getAllByTestId("dias-en-estado").map((e) => e.textContent),
    ).toEqual(["Hoy", "1 día"]);
  });
});
