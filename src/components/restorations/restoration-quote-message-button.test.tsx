import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RestorationQuoteMessageButton } from "./restoration-quote-message-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/restauraciones/1",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (
  id: string,
  description: string,
  status: "registrada" | "rechazada" | "anulada",
  priceCents: number,
) => ({
  id,
  code: `RES-00001-${id}`,
  description,
  service: null,
  priceCents,
  status,
});

describe("RestorationQuoteMessageButton", () => {
  it("arma el mensaje con las piezas elegidas", async () => {
    const user = userEvent.setup();
    render(
      <RestorationQuoteMessageButton
        template="{piezas}\nTotal: S/ {total}"
        data={{
          code: "RES-00001",
          clientName: "Ana",
          paymentType: "contado",
          depositPercent: 0,
          terms: "",
        }}
        pieces={[
          piece("1", "Fuente", "registrada", 10_000),
          piece("2", "Jarra", "rechazada", 5_000),
          piece("3", "Bandeja", "anulada", 2_000),
          piece("4", "Copa", "registrada", 3_000),
        ]}
        phone={null}
        autoOpen
      />,
    );
    const message = () => screen.getByTestId("mensaje-cotizacion").textContent;
    expect(message()).toContain("Fuente");
    expect(message()).toContain("Copa");
    expect(message()).not.toContain("Jarra");
    expect(message()).toContain("Total: S/ 130.00");

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /Fuente/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Jarra/ }));
    expect(message()).not.toContain("Fuente");
    expect(message()).toContain("Jarra");
    expect(message()).toContain("Total: S/ 80.00");
  });
});
