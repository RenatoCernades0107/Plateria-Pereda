"use client";

import { BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { browserEnv } from "@/lib/env.browser";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/server/push-actions";

/**
 * Estado de las notificaciones push en este dispositivo:
 * - `no-disponible`: sin claves VAPID o el navegador no las soporta.
 * - `instalar`: iPhone/iPad en Safari; solo funcionan con la app en la pantalla de inicio.
 * - `bloqueadas`: el usuario las negó; se reactivan en los ajustes del navegador.
 */
export type PushState =
  | "cargando"
  | "no-disponible"
  | "instalar"
  | "bloqueadas"
  | "inactivas"
  | "activas";

/** Recordatorio de activarlas que el usuario cerró con "Ahora no". */
const DISMISSED_KEY = "pereda:push-recordatorio";

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se presenta como Mac con pantalla táctil.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Sin almacenamiento (modo privado): se vuelve a recordar la próxima vez.
  }
}

/** Registra el service worker y maneja la suscripción push de este dispositivo. */
export function usePushNotifications() {
  const [state, setState] = useState<PushState>("cargando");
  const [busy, setBusy] = useState(false);
  const publicKey = browserEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    const set = (next: PushState) => {
      if (!cancelled) setState(next);
    };
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!publicKey) {
      set("no-disponible");
    } else if (!supported) {
      set(isIos() && !isStandalone() ? "instalar" : "no-disponible");
    } else {
      void (async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            "/sw.js",
            { scope: "/", updateViaCache: "none" },
          );
          if (Notification.permission === "denied") return set("bloqueadas");
          const subscription = await registration.pushManager.getSubscription();
          if (subscription && Notification.permission === "granted") {
            // Se vuelve a guardar: el navegador pudo renovarla o cambió el usuario.
            await savePushSubscription(
              subscription.toJSON(),
              navigator.userAgent,
            );
            return set("activas");
          }
          set("inactivas");
        } catch {
          set("no-disponible");
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      // Se pide al tocar el botón: Safari y Chrome solo lo permiten tras un toque.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "bloqueadas" : "inactivas");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        }));
      const result = await savePushSubscription(
        subscription.toJSON(),
        navigator.userAgent,
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setState("activas");
      toast.success("Listo: las alertas te llegarán a este dispositivo.");
    } catch {
      toast.error("No se pudieron activar las notificaciones.");
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("inactivas");
    } catch {
      toast.error("No se pudieron desactivar las notificaciones.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}

/**
 * Al entrar, si este dispositivo puede recibir alertas y todavía no las activó, lo
 * ofrece una vez (el permiso del navegador solo se puede pedir tras un toque).
 */
export function usePushReminder(state: PushState, enable: () => Promise<void>) {
  useEffect(() => {
    if (state !== "inactivas" && state !== "instalar") return;
    if (readDismissed()) return;
    const id = toast(
      state === "instalar"
        ? "Para recibir las alertas en el iPhone, agrega el sistema a la pantalla de inicio (Compartir → Agregar a inicio) y ábrelo desde ahí."
        : "¿Quieres recibir las alertas como notificación en este dispositivo?",
      {
        duration: Infinity,
        action:
          state === "inactivas"
            ? { label: "Activar", onClick: () => void enable() }
            : { label: "Entendido", onClick: writeDismissed },
        cancel: { label: "Ahora no", onClick: writeDismissed },
      },
    );
    return () => {
      toast.dismiss(id);
    };
  }, [state, enable]);
}

/** Pie de la campana: activar o desactivar las alertas en este dispositivo. */
export function PushToggle({
  state,
  busy,
  enable,
  disable,
}: ReturnType<typeof usePushNotifications>) {
  if (state === "cargando" || state === "no-disponible") return null;
  return (
    <div className="text-muted-foreground border-t px-4 py-3 text-xs">
      {state === "activas" ? (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <BellRing className="size-3.5" aria-hidden />
            Notificaciones activas en este dispositivo
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={busy}
            onClick={() => void disable()}
          >
            Desactivar
          </Button>
        </div>
      ) : state === "inactivas" ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => void enable()}
        >
          <BellRing aria-hidden />
          Activar notificaciones en este dispositivo
        </Button>
      ) : state === "bloqueadas" ? (
        <p>
          Bloqueaste las notificaciones de este sistema. Para recibirlas,
          permítelas en los ajustes del navegador o del teléfono.
        </p>
      ) : (
        <p>
          Para recibir las alertas en el iPhone, agrega el sistema a la pantalla
          de inicio (Compartir → Agregar a inicio) y ábrelo desde ahí.
        </p>
      )}
    </div>
  );
}
