import { describe, expect, it } from "vitest";

import {
  isExpiredSubscription,
  pushPayload,
  pushSubscriptionSchema,
} from "./push";

describe("pushPayload", () => {
  const alert = {
    kind: "aprobacion_total",
    restorationId: "00000000-0000-4000-8000-000000000001",
    title: "RES-00001 · Guía aprobada",
    body: "Vera aprobó RES-00001-1 (Fuente).",
  };

  it("abre la guía y agrupa por guía y tipo de alerta", () => {
    expect(pushPayload(alert)).toEqual({
      title: alert.title,
      body: alert.body,
      url: "/restauraciones/00000000-0000-4000-8000-000000000001",
      tag: "aprobacion_total:00000000-0000-4000-8000-000000000001",
    });
  });

  it("recorta los mensajes largos", () => {
    const { body } = pushPayload({ ...alert, body: "a".repeat(800) });
    expect(body).toHaveLength(500);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("pushSubscriptionSchema", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    expirationTime: null,
    keys: { p256dh: "BNc", auth: "tBH" },
  };

  it("acepta la suscripción del navegador", () => {
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it("rechaza endpoints sin https o sin claves", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        ...valid,
        endpoint: "http://fcm.googleapis.com/x",
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ endpoint: valid.endpoint }).success,
    ).toBe(false);
  });
});

describe("isExpiredSubscription", () => {
  it("solo 404 y 410 borran la suscripción", () => {
    expect(isExpiredSubscription(404)).toBe(true);
    expect(isExpiredSubscription(410)).toBe(true);
    expect(isExpiredSubscription(429)).toBe(false);
    expect(isExpiredSubscription(undefined)).toBe(false);
  });
});
