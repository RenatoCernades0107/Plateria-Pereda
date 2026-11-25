import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { computeDelta } from "@/domain/dashboard-format";
import { dashboardScopes } from "@/domain/dashboard-scope";

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

const TODAY = "2026-11-24";
const scopes = dashboardScopes({ from: "2026-11-01", to: TODAY }, TODAY);

describe("KpiTile con alcance de tiempo", () => {
  it("periodo: muestra el rango elegido y «hasta hoy»", () => {
    render(<KpiTile label="Cobrado" value="S/ 1" scope={scopes.periodo} />);
    const badge = screen.getByTestId("scope");
    expect(badge).toHaveAttribute("data-scope", "periodo");
    expect(badge).toHaveTextContent("1 nov – 24 nov 2026");
    expect(badge).toHaveTextContent("hasta hoy");
  });

  it("hoy: «Al día de hoy», aunque el periodo sea otro", () => {
    render(<KpiTile label="Saldo" value="S/ 1" scope={scopes.hoy} />);
    expect(screen.getByTestId("scope")).toHaveAttribute("data-scope", "hoy");
    expect(screen.getByTestId("scope")).toHaveTextContent("Al día de hoy");
  });

  it("cohorte: el rango con «estado actual»", () => {
    render(<KpiTile label="Aprobación" value="50 %" scope={scopes.cohorte} />);
    expect(screen.getByTestId("scope")).toHaveTextContent("estado actual");
  });

  it("con enlace, la etiqueta no se mete dentro del enlace", () => {
    render(
      <KpiTile
        label="En taller"
        value="3"
        href="/piezas?ubicacion=en_taller"
        scope={scopes.hoy}
      />,
    );
    expect(screen.getByTestId("scope").closest("a")).toBeNull();
  });

  it("sin `scope` no dibuja etiqueta", () => {
    render(<KpiTile label="Cobrado" value="S/ 1" />);
    expect(screen.queryByTestId("scope")).toBeNull();
  });
});

describe("KpiTile con información", () => {
  it("el botón ⓘ abre la explicación y no queda dentro del enlace", async () => {
    render(
      <KpiTile
        label="En taller"
        value="3"
        href="/piezas?ubicacion=en_taller"
        info="Piezas que están hoy en el taller."
      />,
    );
    const button = screen.getByRole("button", {
      name: "Cómo se calcula: En taller",
    });
    expect(button.closest("a")).toBeNull();
    await userEvent.click(button);
    expect(
      await screen.findByText("Piezas que están hoy en el taller."),
    ).toBeInTheDocument();
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

  it("muestra el periodo que toma la cifra junto a la etiqueta", () => {
    render(
      <HeroStat
        label="Vendido en el periodo"
        value="S/ 1"
        scope={scopes.periodo}
      />,
    );
    expect(screen.getByTestId("scope")).toHaveTextContent(
      "1 nov – 24 nov 2026",
    );
  });
});
