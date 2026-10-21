"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import {
  getMyAlerts,
  markAlertsRead,
  type MyAlert,
} from "@/server/alerts-actions";

function timeAgo(value: string): string {
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    locale: es,
  });
}

/** "Alertas, 3 sin leer" para lectores de pantalla. */
export function bellLabel(unread: number): string {
  if (unread === 0) return "Alertas";
  return `Alertas, ${unread} sin leer`;
}

/**
 * Campana del encabezado (D76): últimas alertas del usuario. Se actualiza al instante
 * con Supabase Realtime y, por si se pierde la conexión, al volver a la pestaña.
 */
export function AlertsBell({ userId }: { userId: string }) {
  const [alerts, setAlerts] = useState<MyAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Aviso para lectores de pantalla. Sin toast: aparecería en cualquier momento,
  // en medio del trabajo; el contador de la campana ya lo muestra.
  const [announcement, setAnnouncement] = useState("");
  // Recibe las alertas en vivo (Realtime suscrito).
  const [live, setLive] = useState(false);
  // Alertas ya vistas en esta pestaña: solo las nuevas se anuncian.
  const known = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    let result;
    try {
      result = await getMyAlerts();
    } catch {
      return;
    }
    const previous = known.current;
    if (previous) {
      const fresh = result.alerts.find((a) => !a.read && !previous.has(a.id));
      if (fresh) setAnnouncement(`Nueva alerta: ${fresh.title}`);
    }
    known.current = new Set(result.alerts.map((a) => a.id));
    setAlerts(result.alerts);
    setUnread(result.unread);
  }, []);

  useEffect(() => {
    // Primera carga sin bloquear el render del encabezado.
    const first = setTimeout(() => void refresh(), 0);
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Con la sesión ya cargada: sin ella Realtime entra como anónimo y la BD (RLS) lo
    // rechaza.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`alertas-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${userId}`,
          },
          () => void refresh(),
        )
        .subscribe((status) => {
          // Ya suscrita: se recarga por si llegó algo antes de la suscripción.
          if (status === "SUBSCRIBED") {
            void refresh().then(() => {
              if (!cancelled) setLive(true);
            });
          }
        });
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const markRead = async (ids?: string[]) => {
    const targets = ids ?? alerts.filter((a) => !a.read).map((a) => a.id);
    setAlerts((current) =>
      current.map((a) =>
        !ids || ids.includes(a.id) ? { ...a, read: true } : a,
      ),
    );
    setUnread((n) => (ids ? Math.max(n - targets.length, 0) : 0));
    const result = await markAlertsRead(ids);
    if ("error" in result) {
      toast.error(result.error);
      void refresh();
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={bellLabel(unread)}
          data-live={live}
        >
          <Bell />
          {unread > 0 ? (
            <span
              aria-hidden
              className="bg-destructive absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-heading text-sm font-semibold">Alertas</h2>
          {unread > 0 ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => void markRead()}
            >
              Marcar todas como leídas
            </Button>
          ) : null}
        </div>
        {alerts.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            No tienes alertas.
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] divide-y overflow-y-auto">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  onClick={() => {
                    setOpen(false);
                    if (!alert.read) void markRead([alert.id]);
                  }}
                  className={cn(
                    "hover:bg-muted/60 flex gap-3 px-4 py-3 text-sm transition-colors",
                    !alert.read && "bg-muted/30",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      alert.read ? "bg-transparent" : "bg-primary",
                    )}
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="text-heading block font-medium">
                      {alert.title}
                      {alert.read ? null : (
                        <span className="sr-only"> (sin leer)</span>
                      )}
                    </span>
                    <span className="text-muted-foreground block">
                      {alert.body}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {timeAgo(alert.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Popover>
  );
}
