"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AlertKind } from "@/domain/alerts";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import {
  dismissAlerts,
  getMyAlerts,
  markAlertsRead,
  type MyAlert,
} from "@/server/alerts-actions";

import {
  PushToggle,
  usePushNotifications,
  usePushReminder,
} from "./push-toggle";

function timeAgo(value: string): string {
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    locale: es,
  });
}

/** Pestañas de la campana: agrupan las alertas por tipo. */
export const ALERT_TABS: readonly {
  id: string;
  label: string;
  kinds: readonly AlertKind[] | null;
}[] = [
  { id: "todas", label: "Todas", kinds: null },
  {
    id: "aprobacion",
    label: "Aprobadas",
    kinds: ["aprobacion_parcial", "aprobacion_total"],
  },
  {
    id: "espera",
    label: "Espera cliente",
    kinds: ["pieza_en_espera", "guia_en_espera"],
  },
  { id: "lista", label: "Para entregar", kinds: ["guia_lista"] },
];

function inTab(tabId: string, alert: MyAlert): boolean {
  const kinds = ALERT_TABS.find((t) => t.id === tabId)?.kinds;
  return !kinds || kinds.includes(alert.kind);
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
  const [tab, setTab] = useState("todas");
  // Aviso para lectores de pantalla. Sin toast: aparecería en cualquier momento,
  // en medio del trabajo; el contador de la campana ya lo muestra.
  const [announcement, setAnnouncement] = useState("");
  // Recibe las alertas en vivo (Realtime suscrito).
  const [live, setLive] = useState(false);
  // Alertas ya vistas en esta pestaña: solo las nuevas se anuncian.
  const known = useRef<Set<string> | null>(null);
  // Notificaciones push en este dispositivo (llegan aunque la app esté cerrada).
  const push = usePushNotifications();
  usePushReminder(push.state, push.enable);

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

  const dismiss = async (ids: string[]) => {
    if (ids.length === 0) return;
    const removedUnread = alerts.filter(
      (a) => ids.includes(a.id) && !a.read,
    ).length;
    setAlerts((current) => current.filter((a) => !ids.includes(a.id)));
    setUnread((n) => Math.max(n - removedUnread, 0));
    const result = await dismissAlerts(ids);
    if ("error" in result) {
      toast.error(result.error);
      void refresh();
    }
  };

  const visible = alerts.filter((a) => inTab(tab, a));
  const visibleUnread = visible.filter((a) => !a.read).map((a) => a.id);
  const visibleRead = visible.filter((a) => a.read).map((a) => a.id);

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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-heading text-sm font-semibold">Alertas</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {visibleUnread.length > 0 ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() =>
                  void markRead(tab === "todas" ? undefined : visibleUnread)
                }
              >
                {tab === "todas"
                  ? "Marcar todas como leídas"
                  : "Marcar como leídas"}
              </Button>
            ) : null}
            {visibleRead.length > 0 ? (
              <Button
                variant="link"
                size="sm"
                className="text-muted-foreground h-auto p-0"
                onClick={() => void dismiss(visibleRead)}
              >
                Ocultar leídas
              </Button>
            ) : null}
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="border-b px-2 py-2">
          <TabsList className="grid w-full grid-cols-4 group-data-[orientation=horizontal]/tabs:h-auto">
            {ALERT_TABS.map((t) => {
              const count = alerts.filter(
                (a) => !a.read && inTab(t.id, a),
              ).length;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="h-auto min-w-0 flex-col gap-0.5 px-1 py-1 text-xs leading-tight whitespace-normal"
                >
                  {t.label}
                  {count > 0 ? (
                    <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] leading-4">
                      {count}
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            {alerts.length === 0
              ? "No tienes alertas."
              : "No hay alertas de este tipo."}
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] divide-y overflow-y-auto">
            {visible.map((alert) => (
              <li key={alert.id} className="group relative">
                <Link
                  href={alert.href}
                  onClick={() => {
                    setOpen(false);
                    if (!alert.read) void markRead([alert.id]);
                  }}
                  className={cn(
                    "hover:bg-muted/60 flex gap-3 py-3 pr-10 pl-4 text-sm transition-colors",
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground absolute top-2 right-2 size-7"
                  aria-label={`Ocultar alerta: ${alert.title}`}
                  onClick={() => void dismiss([alert.id])}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <PushToggle {...push} />
      </PopoverContent>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Popover>
  );
}
