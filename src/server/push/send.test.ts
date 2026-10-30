import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  rpc: vi.fn(),
  subscriptions: vi.fn(),
  deleted: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({ serverEnv: () => mocks.env }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "alert_settings") {
        return {
          select: async () => ({
            data: [{ id: "aprobacion_total", template: "Listo {guia}" }],
          }),
        };
      }
      return {
        select: () => ({ in: async () => mocks.subscriptions() }),
        delete: () => ({
          in: async (_c: string, ids: string[]) => mocks.deleted(ids),
        }),
      };
    },
  }),
}));

const { dispatchPendingPushes } = await import("./send");

const vapid = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "publica",
  VAPID_PRIVATE_KEY: "privada",
  VAPID_SUBJECT: "mailto:sistemas@ejemplo.com",
};

const alert = {
  id: "n1",
  recipient_id: "u1",
  kind: "aprobacion_total",
  restoration_id: "r1",
  restoration_code: "RES-00001",
  client_name: null,
  actor_name: "Ana",
  data: { live: 2, approved: 2, waiting: 0 },
  pieces: [],
};

describe("dispatchPendingPushes", () => {
  beforeEach(() => {
    mocks.env = { ...vapid };
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [alert], error: null });
    mocks.subscriptions.mockReturnValue({
      data: [
        {
          id: "s1",
          user_id: "u1",
          endpoint: "https://push.test/1",
          p256dh: "k",
          auth: "a",
        },
        {
          id: "s2",
          user_id: "u1",
          endpoint: "https://push.test/2",
          p256dh: "k",
          auth: "a",
        },
        {
          id: "s3",
          user_id: "otro",
          endpoint: "https://push.test/3",
          p256dh: "k",
          auth: "a",
        },
      ],
      error: null,
    });
  });

  it("sin claves VAPID no toma ni envía nada", async () => {
    mocks.env = {};
    expect(await dispatchPendingPushes()).toEqual({
      alerts: 0,
      sent: 0,
      expired: 0,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envía el mensaje de la campana a cada dispositivo del destinatario", async () => {
    mocks.send.mockResolvedValue({});
    expect(await dispatchPendingPushes()).toEqual({
      alerts: 1,
      sent: 2,
      expired: 0,
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const [subscription, payload, options] = mocks.send.mock.calls[0]!;
    expect(subscription).toEqual({
      endpoint: "https://push.test/1",
      keys: { p256dh: "k", auth: "a" },
    });
    expect(JSON.parse(payload)).toEqual({
      title: "RES-00001 · Guía aprobada",
      body: "Listo RES-00001",
      url: "/restauraciones/r1",
      tag: "aprobacion_total:r1",
    });
    expect(options.vapidDetails).toEqual({
      subject: vapid.VAPID_SUBJECT,
      publicKey: "publica",
      privateKey: "privada",
    });
  });

  it("borra los dispositivos cuya suscripción venció", async () => {
    mocks.send
      .mockRejectedValueOnce(
        Object.assign(new Error("gone"), { statusCode: 410 }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("busy"), { statusCode: 429 }),
      );
    expect(await dispatchPendingPushes()).toEqual({
      alerts: 1,
      sent: 0,
      expired: 1,
    });
    expect(mocks.deleted).toHaveBeenCalledWith(["s1"]);
  });
});
