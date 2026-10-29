import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarList, Funnel, Meter, StackedBar } from "./bars";

const money = (n: number) => `S/ ${n}`;

describe("BarList", () => {
  it("lista cada elemento con su valor formateado y la barra proporcional al mayor", () => {
    render(
      <BarList
        testId="barras"
        format={money}
        items={[
          { key: "a", label: "Yape", value: 200, hint: "3 guías" },
          { key: "b", label: "Efectivo", value: 50, href: "/x" },
        ]}
      />,
    );
    const items = within(screen.getByTestId("barras")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Yape");
    expect(items[0]).toHaveTextContent("3 guías");
    expect(items[0]).toHaveTextContent("S/ 200");
    expect(screen.getByRole("link", { name: "Efectivo" })).toHaveAttribute(
      "href",
      "/x",
    );
    const widths = [
      ...document.querySelectorAll<HTMLElement>("span[style]"),
    ].map((el) => el.style.width);
    expect(widths).toEqual(["100%", "25%"]);
  });
});

describe("StackedBar", () => {
  const segments = [
    { key: "a", label: "Oficina", value: 75, color: "bg-viz-1" },
    { key: "b", label: "WhatsApp", value: 25, color: "bg-viz-3" },
  ];
  it("describe los segmentos para lectores de pantalla y en la leyenda", () => {
    render(<StackedBar segments={segments} testId="apilada" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Oficina: 75, WhatsApp: 25",
    );
    const legend = within(screen.getByTestId("apilada")).getAllByRole(
      "listitem",
    );
    expect(legend[0]).toHaveTextContent("Oficina");
    expect(legend[0]).toHaveTextContent("75 %");
    expect(legend[1]).toHaveTextContent("25 %");
  });
  it("la leyenda puede omitirse", () => {
    render(<StackedBar segments={segments} legend={false} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("Funnel", () => {
  it("muestra los pasos con su porcentaje y solo las pérdidas con valor", () => {
    render(
      <Funnel
        testId="embudo"
        steps={[
          { key: "r", label: "Registradas", value: 10, pct: 100 },
          { key: "a", label: "Aprobadas", value: 6, pct: 60 },
          { key: "e", label: "Entregadas", value: 3, pct: 30 },
        ]}
        losses={[
          { key: "x", label: "Anuladas", value: 2 },
          { key: "y", label: "Sin arreglo", value: 0 },
        ]}
      />,
    );
    const steps = screen.getAllByRole("listitem").slice(0, 3);
    expect(steps[1]).toHaveTextContent("Aprobadas");
    expect(steps[1]).toHaveTextContent("6");
    expect(steps[1]).toHaveTextContent("60 %");
    expect(screen.getByText(/Anuladas/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin arreglo/)).toBeNull();
  });
});

describe("Meter", () => {
  it("expone el valor como medidor accesible", () => {
    render(
      <Meter value={60.4} label="Cobrado sobre vendido" caption="detalle" />,
    );
    const meter = screen.getByRole("meter", { name: "Cobrado sobre vendido" });
    expect(meter).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("60 %")).toBeInTheDocument();
  });
  it("sin dato muestra un guion y la barra vacía", () => {
    render(<Meter value={null} label="Tasa" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
  });
});
