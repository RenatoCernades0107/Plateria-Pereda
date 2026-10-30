import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GuidePdfData } from "@/domain/guide-pdf";

import { GuidePdfButton } from "./guide-pdf-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (id: string): GuidePdfData["pieces"][number] => ({
  id,
  code: `RES-00001-${id}`,
  quantity: 1,
  description: `Pieza ${id}`,
  materialName: "",
  serviceName: "",
  measure: "",
  weightGrams: null,
  status: "registrada",
  location: "sin_enviar",
  notes: "",
  priceCents: null,
});

const data: GuidePdfData = {
  company: {
    name: "Platería Pereda",
    phones: "01 444 5555",
    email: "ventas@pereda.pe",
  },
  code: "RES-00001",
  createdAt: "2026-10-01T15:00:00Z",
  status: "registrada",
  kind: "normal",
  paymentType: "contado",
  clientName: "Ana",
  contactName: null,
  phone: "+51 994 000 111",
  shopifyOrderName: null,
  attendedBy: null,
  notes: "",
  pieces: [piece("1"), piece("2")],
  money: null,
};

describe("GuidePdfButton", () => {
  it("abre con todas las piezas elegidas y permite quitarlas", async () => {
    const user = userEvent.setup();
    render(<GuidePdfButton data={data} />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));

    const workshop = screen.getByRole("checkbox", { name: /Para taller/ });
    expect(workshop).not.toBeChecked();
    const boxes = screen.getAllByRole("checkbox").filter((b) => b !== workshop);
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText("Piezas en el PDF (2/2)")).toBeInTheDocument();

    await user.click(boxes[0]!);
    expect(screen.getByText("Piezas en el PDF (1/2)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Elegir todas" }));
    expect(screen.getByText("Piezas en el PDF (2/2)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar todas" }));
    const exportButtons = screen.getAllByRole("button", {
      name: "Exportar PDF",
    });
    expect(exportButtons.at(-1)).toBeDisabled();
  });

  it("sin teléfono del cliente avisa, bloquea el PDF y lleva a actualizarlo", async () => {
    const user = userEvent.setup();
    render(
      <GuidePdfButton data={{ ...data, phone: null }} clientId="client-1" />,
    );
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "no tiene el teléfono del cliente",
    );
    expect(
      screen.getByRole("link", { name: "Actualizar teléfono del cliente" }),
    ).toHaveAttribute("href", "/clientes/client-1");
    expect(
      screen.getAllByRole("button", { name: "Exportar PDF" }).at(-1),
    ).toBeDisabled();
  });

  it("con teléfono no muestra el aviso", async () => {
    const user = userEvent.setup();
    render(<GuidePdfButton data={data} clientId="client-1" />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("solo para taller (logística): sin casilla y sin pedir el teléfono", async () => {
    const user = userEvent.setup();
    render(<GuidePdfButton data={{ ...data, phone: null }} workshopOnly />);
    await user.click(screen.getByRole("button", { name: "Guía para taller" }));

    expect(
      screen.queryByRole("checkbox", { name: /Para taller/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exportar PDF" }),
    ).not.toBeDisabled();
  });
});
