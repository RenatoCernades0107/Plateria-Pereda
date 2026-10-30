import { z } from "zod";

/**
 * Notificaciones push de las alertas: lo que el servidor envía y lo que el service
 * worker (`public/sw.js`) muestra. El mensaje es el mismo de la campana.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Página que se abre al tocar la notificación. */
  url: string;
  /** Una guía y tipo de alerta reemplaza a la anterior en vez de apilarse. */
  tag: string;
};

/** Límite práctico de los servicios de push (~4 KB cifrado): se recorta el mensaje. */
const BODY_MAX = 500;

export function pushPayload(alert: {
  kind: string;
  restorationId: string;
  title: string;
  body: string;
}): PushPayload {
  const body =
    alert.body.length > BODY_MAX
      ? `${alert.body.slice(0, BODY_MAX - 1).trimEnd()}…`
      : alert.body;
  return {
    title: alert.title,
    body,
    url: `/restauraciones/${alert.restorationId}`,
    tag: `${alert.kind}:${alert.restorationId}`,
  };
}

/** Suscripción que entrega el navegador (`PushSubscription.toJSON()`). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** El servicio de push responde 404 o 410 cuando la suscripción ya no existe. */
export function isExpiredSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
