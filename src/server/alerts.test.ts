import { describe, expect, it, vi } from "vitest";

import { DEFAULT_ALERT_TEMPLATES } from "@/domain/alerts";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), profiles: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) =>
      table === "alert_settings"
        ? { select: mocks.settings }
        : {
            select: () => ({
              eq: () => ({
                in: (_c: string, roles: string[]) => ({
                  order: () => mocks.profiles(roles),
                }),
              }),
            }),
          },
  }),
}));

const { getAlertSettings, listAlertRecipients } = await import("./alerts");

describe("getAlertSettings", () => {
  it("devuelve las cinco alertas en orden, con el mensaje por defecto si no hay propio", async () => {
    mocks.settings.mockResolvedValue({
      error: null,
      data: [
        {
          id: "guia_en_espera",
          enabled: false,
          template: null,
          muted_user_ids: ["u-2"],
        },
        {
          id: "aprobacion_parcial",
          enabled: true,
          template: "Hola {guia}",
          muted_user_ids: [],
        },
      ],
    });
    const settings = await getAlertSettings();
    expect(settings.map((s) => s.kind)).toEqual([
      "aprobacion_parcial",
      "aprobacion_total",
      "pieza_en_espera",
      "guia_en_espera",
      "guia_lista",
    ]);
    expect(settings[0]).toEqual({
      kind: "aprobacion_parcial",
      enabled: true,
      customTemplate: "Hola {guia}",
      template: "Hola {guia}",
      mutedUserIds: [],
    });
    expect(settings[1]!.template).toBe(
      DEFAULT_ALERT_TEMPLATES.aprobacion_total,
    );
    expect(settings[3]).toMatchObject({
      enabled: false,
      mutedUserIds: ["u-2"],
    });
  });

  it("propaga el error", async () => {
    mocks.settings.mockResolvedValue({ error: new Error("x"), data: null });
    await expect(getAlertSettings()).rejects.toThrow("x");
  });
});

describe("listAlertRecipients", () => {
  it("lista los usuarios activos de los roles que reciben alertas", async () => {
    mocks.profiles.mockResolvedValue({
      error: null,
      data: [{ id: "u-1", full_name: "Ana", role: "admin" }],
    });
    expect(await listAlertRecipients()).toEqual([
      { id: "u-1", fullName: "Ana", role: "admin" },
    ]);
    expect(mocks.profiles.mock.calls[0]![0].sort()).toEqual([
      "admin",
      "logistica",
      "ventas",
    ]);
  });

  it("propaga el error", async () => {
    mocks.profiles.mockResolvedValue({ error: new Error("y"), data: null });
    await expect(listAlertRecipients()).rejects.toThrow("y");
  });
});
