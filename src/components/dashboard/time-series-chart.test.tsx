import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TimeSeriesChart, type SeriesPoint } from "./time-series-chart";

const data: SeriesPoint[] = [
  { label: "1 oct", longLabel: "1 oct", vendido: 1200, cobrado: 300 },
  { label: "2 oct", longLabel: "2 oct", vendido: 0, cobrado: 1250.5 },
];
const series = [
  {
    key: "vendido",
    label: "Vendido",
    color: "var(--viz-1)",
    kind: "area" as const,
  },
  {
    key: "cobrado",
    label: "Cobrado",
    color: "var(--viz-2)",
    kind: "line" as const,
  },
];

describe("TimeSeriesChart", () => {
  it("con dos series muestra la leyenda y el gráfico con su descripción", () => {
    render(
      <TimeSeriesChart
        data={data}
        series={series}
        valueKind="money"
        ariaLabel="Vendido y cobrado por día"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Vendido y cobrado por día" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Series" })).toHaveTextContent(
      "Vendido",
    );
    expect(screen.getByRole("list", { name: "Series" })).toHaveTextContent(
      "Cobrado",
    );
  });

  it("con una sola serie no hay leyenda", () => {
    render(
      <TimeSeriesChart
        data={data}
        series={[series[0]!]}
        valueKind="count"
        ariaLabel="x"
      />,
    );
    expect(screen.queryByRole("list", { name: "Series" })).toBeNull();
  });

  it("«Ver como tabla» muestra los mismos valores en soles y se puede volver", async () => {
    const user = userEvent.setup();
    render(
      <TimeSeriesChart
        data={data}
        series={series}
        valueKind="money"
        ariaLabel="x"
      />,
    );
    await user.click(screen.getByTestId("ver-como-tabla"));
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("S/ 1,200");
    expect(table).toHaveTextContent("S/ 1,251");
    expect(
      screen.getByRole("columnheader", { name: "Cobrado" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    await user.click(screen.getByTestId("ver-como-tabla"));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
