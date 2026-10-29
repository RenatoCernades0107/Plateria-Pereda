import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { computeDelta } from "@/domain/dashboard-format";

import { DeltaBadge, HeroStat, KpiTile } from "./kpi";

describe("DeltaBadge", () => {
  it("muestra el signo y el porcentaje, con texto accesible", () => {
    render(<DeltaBadge delta={computeDelta(150, 100)} />);
    const badge = screen.getByTestId("delta");
    expect(badge).toHaveTextContent("+50.0 %");
    expect(badge).toHaveAttribute(
      "aria-label",
      "+50.0 % respecto del periodo anterior",
    );
    expect(badge).toHaveAttribute("data-tone", "success");
  });

  it("una baja es crítica, salvo que subir sea lo malo", () => {
    const { rerender } = render(<DeltaBadge delta={computeDelta(50, 100)} />);
    expect(screen.getByTestId("delta")).toHaveAttribute(
      "data-tone",
      "critical",
    );
    rerender(<DeltaBadge delta={computeDelta(50, 100)} upIsGood={false} />);
    expect(screen.getByTestId("delta")).toHaveAttribute("data-tone", "success");
  });

  it("sin variación no dibuja nada", () => {
    const { container } = render(<DeltaBadge delta={computeDelta(0, 0)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("KpiTile", () => {
  it("muestra etiqueta, valor, pista y variación", () => {
    render(
      <KpiTile
        testId="kpi"
        label="Cobrado"
        value="S/ 1,000"
        hint="Pagos menos reembolsos"
        delta={computeDelta(110, 100)}
        spark={[1, 3, 2, 5]}
      />,
    );
    expect(screen.getByText("Cobrado")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-valor")).toHaveTextContent("S/ 1,000");
    expect(screen.getByText("Pagos menos reembolsos")).toBeInTheDocument();
    expect(screen.getByTestId("delta")).toHaveTextContent("+10.0 %");
    expect(document.querySelector("[data-slot=sparkline]")).not.toBeNull();
  });

  it("con enlace, toda la tarjeta lleva al listado", () => {
    render(
      <KpiTile
        label="En taller"
        value="3"
        href="/piezas?ubicacion=en_taller"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/piezas?ubicacion=en_taller",
    );
  });
});

describe("HeroStat", () => {
  it("es una región con nombre, con la cifra grande y la variación", () => {
    render(
      <HeroStat
        testId="hero"
        label="Vendido en el periodo"
        value="S/ 17,715"
        delta={computeDelta(200, 100)}
        previousLabel="vs 29 ago – 27 sep"
      >
        <p>Una frase</p>
      </HeroStat>,
    );
    expect(
      screen.getByRole("region", { name: "Vendido en el periodo" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("hero-valor")).toHaveTextContent("S/ 17,715");
    expect(screen.getByText("vs 29 ago – 27 sep")).toBeInTheDocument();
    expect(screen.getByText("Una frase")).toBeInTheDocument();
  });
});
