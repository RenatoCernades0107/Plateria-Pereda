import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALERT_KINDS, DEFAULT_ALERT_TEMPLATES } from "@/domain/alerts";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  rpc: vi.fn(),
  settings: vi.fn(),
  update: vi.fn(),
  markQuery: vi.fn(),
  recipients: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({
    id: "00000000-0000-4000-8000-000000000018",
    role: "logistica",
  }),
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "00000000-0000-4000-8000-000000000020", role: "admin" };
  },
}));
vi.mock("@/server/alerts", () => ({
  listAlertRecipients: mocks.recipients,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "notifications") {
        const calls: unknown[] = [];
        const query = {
          update: (v: unknown) => (calls.push(["update", v]), query),
          eq: (...a: unknown[]) => (calls.push(["eq", ...a]), query),
          is: (...a: unknown[]) => (calls.push(["is", ...a]), query),
          in: (...a: unknown[]) => (calls.push(["in", ...a]), query),
          then: (resolve: (v: unknown) => void) =>
            resolve(mocks.markQuery(calls)),
        };
        return query;
      }
      return {
        select: mocks.settings,
        update: (values: object) => ({
          eq: (_c: string, id: string) => mocks.update(id, values),
        }),
      };
    },
  }),
}));

const { getMyAlerts, markAlertsRead, updateAlertSettings } =
  await import("./alerts-actions");

describe("getMyAlerts", () => {
  it("arma los mensajes con la plantilla vigente", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: [
        {
          id: "00000000-0000-4000-8000-000000000016",
          kind: "aprobacion_parcial",
          restoration_id: "00000000-0000-4000-8000-000000000017",
          restoration_code: "RES-00001",
          client_name: null,
          actor_name: "Vera",
          data: { live: 3, approved: 1, waiting: 0 },
          pieces: [{ code: "RES-00001-1", description: "Fuente" }],
          created_at: "2026-10-21T10:00:00Z",
          read_at: null,
          unread_count: 4,
        },
      ],
    });
    mocks.settings.mockResolvedValue({
      data: [
        { id: "aprobacion_parcial", template: "{aprobadas}/{total} en {guia}" },
      ],
    });

    expect(await getMyAlerts()).toEqual({
      unread: 4,
      alerts: [
        {
          id: "00000000-0000-4000-8000-000000000016",
          kind: "aprobacion_parcial",
          title: "RES-00001 · Guía parcialmente aprobada",
          body: "1/3 en RES-00001",
          href: "/restauraciones/00000000-0000-4000-8000-000000000017",
          createdAt: "2026-10-21T10:00:00Z",
          read: false,
        },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("my_notifications", { p_limit: 20 });
  });

  it("sin alertas: cero sin leer", async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [] });
    mocks.settings.mockResolvedValue({ data: [] });
    expect(await getMyAlerts()).toEqual({ alerts: [], unread: 0 });
  });
});

describe("markAlertsRead", () => {
  beforeEach(() =>
    mocks.markQuery.mockReset().mockReturnValue({ error: null }),
  );

  it("marca las indicadas del usuario", async () => {
    expect(
      await markAlertsRead(["00000000-0000-4000-8000-000000000016"]),
    ).toEqual({ ok: true });
    expect(mocks.markQuery.mock.calls[0]![0]).toEqual(
      expect.arrayContaining([
        ["eq", "recipient_id", "00000000-0000-4000-8000-000000000018"],
        ["in", "id", ["00000000-0000-4000-8000-000000000016"]],
      ]),
    );
  });

  it("sin ids marca todas; con lista vacía no hace nada", async () => {
    await markAlertsRead();
    expect(mocks.markQuery.mock.calls[0]![0]).not.toContainEqual(
      expect.arrayContaining(["in"]),
    );
    mocks.markQuery.mockClear();
    expect(await markAlertsRead([])).toEqual({ ok: true });
    expect(mocks.markQuery).not.toHaveBeenCalled();
  });

  it("informa el error", async () => {
    mocks.markQuery.mockReturnValue({ error: { message: "x" } });
    expect(await markAlertsRead()).toEqual({
      error: "No se pudieron marcar las alertas.",
    });
  });
});

describe("updateAlertSettings", () => {
  const admin = "00000000-0000-4000-8000-000000000001";
  const ventas = "00000000-0000-4000-8000-000000000002";
  const logistica = "00000000-0000-4000-8000-000000000003";
  const input = {
    alerts: ALERT_KINDS.map((kind) => ({
      kind,
      enabled: kind !== "guia_en_espera",
      template:
        kind === "pieza_en_espera"
          ? "Pieza {guia}"
          : DEFAULT_ALERT_TEMPLATES[kind],
      recipientIds: [admin],
    })),
  };

  beforeEach(() => {
    mocks.forbidden = false;
    mocks.update.mockReset().mockResolvedValue({ error: null });
    mocks.recipients.mockResolvedValue([
      { id: admin, fullName: "Ana", role: "admin" },
      { id: ventas, fullName: "Vera", role: "ventas" },
      { id: logistica, fullName: "Lalo", role: "logistica" },
    ]);
  });

  it("guarda cada alerta: mensaje propio o null y los usuarios silenciados", async () => {
    expect(await updateAlertSettings(input)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith("aprobacion_parcial", {
      enabled: true,
      template: null,
      muted_user_ids: [logistica],
    });
    expect(mocks.update).toHaveBeenCalledWith("pieza_en_espera", {
      enabled: true,
      template: "Pieza {guia}",
      muted_user_ids: [ventas],
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "guia_en_espera",
      expect.objectContaining({ enabled: false }),
    );
  });

  it("rechaza variables desconocidas sin guardar", async () => {
    const bad = {
      alerts: input.alerts.map((a) => ({ ...a, template: "{nada}" })),
    };
    expect(await updateAlertSettings(bad)).toEqual({
      error: "Revisa los mensajes de las alertas.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("informa el error de la base de datos", async () => {
    mocks.update.mockResolvedValue({ error: { message: "x" } });
    expect(await updateAlertSettings(input)).toEqual({
      error: "No se pudo guardar la configuración.",
    });
  });

  it("solo el admin", async () => {
    mocks.forbidden = true;
    await expect(updateAlertSettings(input)).rejects.toThrow("FORBIDDEN");
  });
});
