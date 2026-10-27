import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardRange } from "@/domain/dashboard-range";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

import { DashboardShell, type AreaTab } from "./dashboard-shell";

const tabs: AreaTab[] = [
  { key: "resumen", label: "Resumen" },
  { key: "ventas", label: "Ventas" },
  { key: "vendedores", label: "Mi desempeño" },
];
const range: DashboardRange = {
  from: "2026-09-28",
  to: "2026-10-27",
  preset: "30d",
};

function setup(
  overrides: Partial<{
    area: "resumen" | "ventas";
    range: DashboardRange;
  }> = {},
) {
  return render(
    <DashboardShell
      area={overrides.area ?? "resumen"}
      range={overrides.range ?? range}
      today="2026-10-27"
      tabs={tabs}
      rangeText="28 set – 27 oct 2026"
      previousText="29 ago – 27 set 2026"
    >
      <p>contenido</p>
    </DashboardShell>,
  );
}

describe("DashboardShell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca el atajo y la pestaña actuales y muestra el rango comparado", () => {
    setup({ area: "ventas" });
    expect(screen.getByTestId("rango-30d")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("rango-7d")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("pestana-ventas")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("rango-texto")).toHaveTextContent(
      "28 set – 27 oct 2026 · Comparado con 29 ago – 27 set 2026",
    );
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("los atajos son enlaces compartibles que conservan la pestaña", () => {
    setup({ area: "ventas" });
    expect(screen.getByTestId("rango-mes")).toHaveAttribute(
      "href",
      "/dashboard?area=ventas&rango=mes",
    );
    expect(screen.getByTestId("pestana-vendedores")).toHaveAttribute(
      "href",
      "/dashboard?area=vendedores",
    );
  });

  it("un clic en un atajo navega sin recargar", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId("rango-7d"));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard?rango=7d", {
      scroll: false,
    });
  });

  it("el rango personalizado se aplica con las fechas elegidas (y ordenadas)", async () => {
    const user = userEvent.setup();
    setup({ area: "ventas" });
    await user.click(screen.getByTestId("rango-personalizado"));
    const desde = screen.getByTestId("rango-desde");
    const hasta = screen.getByTestId("rango-hasta");
    await user.clear(desde);
    await user.type(desde, "2026-10-20");
    await user.clear(hasta);
    await user.type(hasta, "2026-10-05");
    await user.click(screen.getByTestId("rango-aplicar"));
    expect(mocks.replace).toHaveBeenCalledWith(
      "/dashboard?area=ventas&rango=custom&desde=2026-10-05&hasta=2026-10-20",
      { scroll: false },
    );
  });

  it("con un rango personalizado el formulario ya está abierto y «Aplicar» exige fechas válidas", async () => {
    const user = userEvent.setup();
    setup({
      range: { from: "2026-10-01", to: "2026-10-05", preset: "custom" },
    });
    expect(screen.getByTestId("rango-formulario")).toBeInTheDocument();
    await user.clear(screen.getByTestId("rango-desde"));
    expect(screen.getByTestId("rango-aplicar")).toBeDisabled();
  });
});
