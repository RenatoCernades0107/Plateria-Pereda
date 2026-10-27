"use client";

import { CalendarRange } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dashboardHref,
  isIsoDate,
  presetRange,
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  type DashboardArea,
  type DashboardRange,
} from "@/domain/dashboard-range";
import { cn } from "@/lib/utils";

export type AreaTab = { key: DashboardArea; label: string };

/**
 * Marco del dashboard: atajos de fechas, rango personalizado y pestañas. Todo vive en la
 * URL (compartible); cambiarlo vuelve a pedir los datos al servidor y, mientras llegan, el
 * contenido anterior queda atenuado en su sitio, sin saltos ni esqueletos.
 */
export function DashboardShell({
  area,
  range,
  today,
  tabs,
  rangeText,
  previousText,
  children,
}: {
  area: DashboardArea;
  range: DashboardRange;
  /** Hoy en Lima ("AAAA-MM-DD"): tope de las fechas elegibles. */
  today: string;
  tabs: AreaTab[];
  rangeText: string;
  previousText: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(range.preset === "custom");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const go = (href: string, replace = false) =>
    startTransition(() => {
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });

  // Un clic normal navega con transición; con Ctrl/⌘/botón central abre una pestaña.
  const onLink = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    go(href);
  };

  const customValid = isIsoDate(from) && isIsoDate(to);
  const applyCustom = () => {
    if (!customValid) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    go(
      dashboardHref({
        area,
        range: { from: a, to: b, preset: "custom" },
      }),
      true,
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3" data-testid="dashboard-filtros">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Periodo"
            className="bg-muted/60 flex max-w-full flex-wrap gap-1 rounded-xl border p-1"
          >
            {RANGE_PRESETS.map((preset) => {
              const active = range.preset === preset;
              const href = dashboardHref({
                area,
                range: presetRange(preset, today),
              });
              return (
                <a
                  key={preset}
                  href={href}
                  onClick={onLink(href)}
                  aria-current={active ? "true" : undefined}
                  data-testid={`rango-${preset}`}
                  className={cn(
                    "focus-visible:ring-ring rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                    active
                      ? "bg-card text-heading shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {RANGE_PRESET_LABELS[preset]}
                </a>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomOpen((open) => !open)}
              aria-expanded={customOpen}
              aria-current={range.preset === "custom" ? "true" : undefined}
              data-testid="rango-personalizado"
              className={cn(
                "focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                range.preset === "custom"
                  ? "bg-card text-heading shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarRange aria-hidden className="size-4" />
              Personalizado
            </button>
          </div>
          {pending ? (
            <span
              role="status"
              className="text-muted-foreground animate-pulse text-xs"
            >
              Actualizando…
            </span>
          ) : null}
        </div>

        {customOpen ? (
          <form
            className="bg-card flex flex-wrap items-end gap-3 rounded-xl border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              applyCustom();
            }}
            data-testid="rango-formulario"
          >
            <label className="space-y-1 text-xs font-medium">
              Desde
              <Input
                type="date"
                value={from}
                max={today}
                onChange={(event) => setFrom(event.target.value)}
                className="w-40"
                data-testid="rango-desde"
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Hasta
              <Input
                type="date"
                value={to}
                max={today}
                onChange={(event) => setTo(event.target.value)}
                className="w-40"
                data-testid="rango-hasta"
              />
            </label>
            <Button
              type="submit"
              disabled={!customValid}
              data-testid="rango-aplicar"
            >
              Aplicar
            </Button>
          </form>
        ) : null}

        <p className="text-muted-foreground text-sm" data-testid="rango-texto">
          <span className="text-foreground font-medium">{rangeText}</span>
          <span aria-hidden> · </span>
          <span className="whitespace-nowrap">
            Comparado con {previousText}
          </span>
        </p>
      </div>

      <nav
        aria-label="Áreas del dashboard"
        className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1 border-b">
          {tabs.map((tab) => {
            const active = tab.key === area;
            const href = dashboardHref({ area: tab.key, range });
            return (
              <li key={tab.key}>
                <a
                  href={href}
                  onClick={onLink(href)}
                  aria-current={active ? "page" : undefined}
                  data-testid={`pestana-${tab.key}`}
                  className={cn(
                    "focus-visible:ring-ring -mb-px block border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                    active
                      ? "border-primary text-heading"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {tab.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        aria-busy={pending}
        className={cn(
          "space-y-5 transition-opacity duration-200",
          pending && "pointer-events-none opacity-50",
        )}
      >
        {children}
      </div>
    </div>
  );
}
