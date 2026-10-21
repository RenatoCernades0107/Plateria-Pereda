import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyAlerts } from "@/server/alerts-actions";

import { AlertsBell, bellLabel } from "./alerts-bell";

const mocks = vi.hoisted(() => ({
  getMyAlerts: vi.fn(),
  markAlertsRead: vi.fn(),
  onInsert: null as null | (() => void),
  removeChannel: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/server/alerts-actions", () => ({
  getMyAlerts: mocks.getMyAlerts,
  markAlertsRead: mocks.markAlertsRead,
}));
vi.mock("sonner", () => ({
  toast: { info: mocks.toastInfo, error: vi.fn() },
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => {
    const channel = {
      on: (_type: string, _filter: object, cb: () => void) => {
        mocks.onInsert = cb;
        return channel;
      },
      subscribe: () => channel,
    };
    return {
      auth: {
        getSession: async () => ({
          data: { session: { access_token: "token" } },
        }),
      },
      realtime: { setAuth: vi.fn() },
      channel: () => channel,
      removeChannel: mocks.removeChannel,
    };
  },
}));

const alert = (id: string, read: boolean) => ({
  id,
  kind: "aprobacion_parcial" as const,
  title: `RES-0000${id} · Guía parcialmente aprobada`,
  body: "Van 2 de 4 piezas aprobadas.",
  href: `/restauraciones/r-${id}`,
  createdAt: new Date().toISOString(),
  read,
});

describe("AlertsBell", () => {
  beforeEach(() => {
    mocks.getMyAlerts.mockReset();
    mocks.markAlertsRead.mockReset().mockResolvedValue({ ok: true });
    mocks.toastInfo.mockReset();
  });

  it("dice cuántas alertas hay sin leer", () => {
    expect(bellLabel(0)).toBe("Alertas");
    expect(bellLabel(3)).toBe("Alertas, 3 sin leer");
  });

  it("muestra las alertas y las marca como leídas", async () => {
    mocks.getMyAlerts.mockResolvedValue({
      alerts: [alert("1", false), alert("2", true)],
      unread: 1,
    } satisfies MyAlerts);
    render(<AlertsBell userId="u-1" />);

    const bell = await screen.findByRole("button", {
      name: "Alertas, 1 sin leer",
    });
    await userEvent.click(bell);
    expect(
      await screen.findByText("RES-00001 · Guía parcialmente aprobada"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /RES-00002/ })).toHaveAttribute(
      "href",
      "/restauraciones/r-2",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Marcar todas como leídas" }),
    );
    expect(mocks.markAlertsRead).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("button", { name: "Alertas" })).toBeInTheDocument();
  });

  it("sin alertas lo dice", async () => {
    mocks.getMyAlerts.mockResolvedValue({ alerts: [], unread: 0 });
    render(<AlertsBell userId="u-1" />);
    await waitFor(() => expect(mocks.getMyAlerts).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Alertas" }));
    expect(await screen.findByText("No tienes alertas.")).toBeVisible();
  });

  it("avisa cuando llega una alerta nueva en vivo", async () => {
    mocks.getMyAlerts
      .mockResolvedValueOnce({ alerts: [alert("1", true)], unread: 0 })
      .mockResolvedValue({
        alerts: [alert("3", false), alert("1", true)],
        unread: 1,
      });
    render(<AlertsBell userId="u-1" />);
    await waitFor(() => expect(mocks.getMyAlerts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.onInsert).not.toBeNull());
    expect(mocks.toastInfo).not.toHaveBeenCalled();

    await act(async () => mocks.onInsert?.());
    expect(
      await screen.findByText(
        "Nueva alerta: RES-00003 · Guía parcialmente aprobada",
      ),
    ).toBeInTheDocument();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Alertas, 1 sin leer" }),
    ).toBeInTheDocument();
  });
});
