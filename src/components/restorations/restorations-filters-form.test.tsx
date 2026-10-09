import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { parseRestorationFilters } from "@/domain/restoration-filters";

import { RestorationsFiltersForm } from "./restorations-filters-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/clients/client-picker", () => ({
  ClientPicker: () => <div />,
}));

const render_ = (params: Record<string, string | string[]> = {}) =>
  render(
    <RestorationsFiltersForm
      filters={parseRestorationFilters(params)}
      clientName={null}
      workshops={[{ id: "00000000-0000-0000-0000-000000000001", name: "T1" }]}
      showMoney
    />,
  );

describe("RestorationsFiltersForm", () => {
  it("muestra los filtros principales y oculta el resto hasta desplegar", async () => {
    const user = userEvent.setup();
    render_();
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado de pago")).toBeInTheDocument();
    expect(screen.queryByLabelText("Taller")).toBeNull();
    expect(screen.queryByLabelText("Desde")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Más filtros" }));
    expect(screen.getByLabelText("Taller")).toBeInTheDocument();
    expect(screen.getByLabelText("Origen")).toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Menos filtros" }));
    expect(screen.queryByLabelText("Taller")).toBeNull();
  });

  it("abre los secundarios si alguno ya está aplicado", () => {
    render_({ origen: ["oficina", "whatsapp"] });
    expect(screen.getByLabelText("Origen")).toHaveTextContent(
      "2 seleccionados",
    );
  });

  it("permite elegir varios valores en un mismo filtro y filtra con todos", async () => {
    const user = userEvent.setup();
    render_();
    await user.click(screen.getByLabelText("Estado"));
    await user.click(await screen.findByRole("option", { name: /Aprobada/ }));
    await user.click(screen.getByRole("option", { name: /Lista/ }));
    expect(screen.getByLabelText("Estado")).toHaveTextContent(
      "2 seleccionados",
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/estado=aprobada&estado=lista/),
    );
  });
});
