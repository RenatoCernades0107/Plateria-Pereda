import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncStatus } from "./sync-status";

const mocks = vi.hoisted(() => ({
  retry: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/clientes/1" }));
vi.mock("@/server/shopify-sync/actions", () => ({
  retryShopifyJob: (...a: unknown[]) => mocks.retry(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

describe("SyncStatus", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.retry.mockResolvedValue({ ok: true });
  });

  it.each([
    ["ok", "Shopify: Sincronizado"],
    ["pending", "Shopify: Pendiente"],
    ["processing", "Shopify: Pendiente"],
    ["error", "Shopify: Error"],
  ] as const)("muestra el estado %s", (status, text) => {
    render(<SyncStatus jobId={1} status={status} />);
    expect(screen.getByTestId("estado-shopify")).toHaveTextContent(text);
  });

  it("solo ofrece reintentar cuando hubo error y se permite", () => {
    const { rerender } = render(<SyncStatus jobId={1} status="pending" />);
    expect(
      screen.queryByRole("button", { name: "Reintentar" }),
    ).not.toBeInTheDocument();
    rerender(<SyncStatus jobId={1} status="error" canRetry={false} />);
    expect(
      screen.queryByRole("button", { name: "Reintentar" }),
    ).not.toBeInTheDocument();
  });

  it("reintenta el job y avisa", async () => {
    const user = userEvent.setup();
    render(
      <SyncStatus jobId={9} status="error" lastError="Shopify no responde" />,
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.retry).toHaveBeenCalledWith(9, "/clientes/1");
    expect(mocks.success).toHaveBeenCalledWith(
      "Reintentando la sincronización con Shopify.",
    );

    mocks.retry.mockResolvedValue({
      error: "Esta sincronización ya no se puede reintentar.",
    });
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.error).toHaveBeenCalledWith(
      "Esta sincronización ya no se puede reintentar.",
    );
  });

  it("muestra el último error al pasar sobre el estado", async () => {
    const user = userEvent.setup();
    render(
      <SyncStatus jobId={9} status="error" lastError="Shopify no responde" />,
    );
    await user.hover(screen.getByTestId("estado-shopify"));
    expect(
      (await screen.findAllByText("Shopify no responde")).length,
    ).toBeGreaterThan(0);
  });
});
