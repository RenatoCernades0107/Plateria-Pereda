import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WhatsAppQuoteDialog } from "./whatsapp-quote-dialog";

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const MESSAGE = "Hola Ana.\n\n1. Fuente: S/ 1,200.50\n*Total: S/ 1,200.50*";

describe("WhatsAppQuoteDialog", () => {
  beforeEach(() => {
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("muestra la vista previa con sus saltos de línea", () => {
    render(
      <WhatsAppQuoteDialog
        open
        onOpenChange={vi.fn()}
        message={MESSAGE}
        phone="999888777"
      />,
    );
    expect(screen.getByTestId("mensaje-cotizacion").textContent).toBe(MESSAGE);
  });

  it("copia el mensaje al portapapeles y avisa", async () => {
    const user = userEvent.setup();
    render(
      <WhatsAppQuoteDialog
        open
        onOpenChange={vi.fn()}
        message={MESSAGE}
        phone={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(await navigator.clipboard.readText()).toBe(MESSAGE);
    expect(mocks.success).toHaveBeenCalledWith("Mensaje copiado.");
  });

  it("avisa si no se pudo copiar", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denegado"),
    );
    render(
      <WhatsAppQuoteDialog
        open
        onOpenChange={vi.fn()}
        message={MESSAGE}
        phone={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("enlaza a wa.me con el número normalizado y el texto codificado", () => {
    render(
      <WhatsAppQuoteDialog
        open
        onOpenChange={vi.fn()}
        message="Hola Ana"
        phone="+51 999 888 777"
      />,
    );
    const link = screen.getByRole("link", { name: "Abrir WhatsApp" });
    expect(link).toHaveAttribute(
      "href",
      "https://wa.me/51999888777?text=Hola%20Ana",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it.each([null, "", "123"])(
    "sin teléfono válido (%j) no muestra Abrir WhatsApp",
    (phone) => {
      render(
        <WhatsAppQuoteDialog
          open
          onOpenChange={vi.fn()}
          message={MESSAGE}
          phone={phone}
        />,
      );
      expect(
        screen.queryByRole("link", { name: "Abrir WhatsApp" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copiar" })).toBeVisible();
    },
  );

  it("avisa al cerrar", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <WhatsAppQuoteDialog
        open
        onOpenChange={onOpenChange}
        message={MESSAGE}
        phone={null}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
