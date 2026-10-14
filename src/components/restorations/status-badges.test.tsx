import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PaymentStatusBadge,
  RestorationStatusBadge,
  StatusAge,
} from "./status-badges";

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
});
