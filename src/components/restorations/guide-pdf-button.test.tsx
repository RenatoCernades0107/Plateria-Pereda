import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GuidePdfData } from "@/domain/guide-pdf";

import { GuidePdfButton } from "./guide-pdf-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (id: string): GuidePdfData["pieces"][number] => ({
  id,
  code: `RES-00001-${id}`,
  description: `Pieza ${id}`,
  materialName: "",
  serviceName: "",
  measure: "",
  weightGrams: null,
  status: "registrada",
  notes: "",
  priceCents: null,
});

const data: GuidePdfData = {
  companyName: "Platería Pereda",
  code: "RES-00001",
  createdAt: "2026-10-01T15:00:00Z",
  status: "registrada",
  paymentType: "contado",
  clientName: "Ana",
  contactName: null,
  phone: null,
  notes: "",
  pieces: [piece("1"), piece("2")],
  money: null,
};

describe("GuidePdfButton", () => {
  it("abre con todas las piezas elegidas y permite quitarlas", async () => {
    const user = userEvent.setup();
    render(<GuidePdfButton data={data} />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));

    const boxes = screen.getAllByRole("checkbox");
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
});
