import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setQuoteWorkshopNotes } from "@/server/quotes/actions";

import { QuoteWorkshopNotes } from "./quote-workshop-notes";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/server/quotes/actions", () => ({ setQuoteWorkshopNotes: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";

afterEach(() => vi.clearAllMocks());

describe("QuoteWorkshopNotes", () => {
  it("sin instrucciones, ofrece agregarlas y las guarda", async () => {
    vi.mocked(setQuoteWorkshopNotes).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<QuoteWorkshopNotes quoteId={id} notes="" />);
    expect(screen.getByText(/Sin instrucciones/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agregar" }));
    await user.type(screen.getByLabelText("Instrucciones"), "Acabado mate");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(setQuoteWorkshopNotes).toHaveBeenCalledWith(id, "Acabado mate");
    expect(refresh).toHaveBeenCalled();
  });

  it("muestra el error de la acción", async () => {
    vi.mocked(setQuoteWorkshopNotes).mockResolvedValue({
      error: "No se pudieron guardar las instrucciones.",
    });
    const user = userEvent.setup();
    render(<QuoteWorkshopNotes quoteId={id} notes="Estuche azul" />);
    expect(screen.getByText("Estuche azul")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("No se pudieron guardar las instrucciones."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
