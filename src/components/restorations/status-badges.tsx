import type { ComponentProps, ComponentType } from "react";
import {
  AlertTriangle,
  Ban,
  CircleCheck,
  ClipboardList,
  Clock,
  Eye,
  Hammer,
  Hourglass,
  MessageCircleQuestionMark,
  PackageCheck,
  PackageSearch,
  Store,
  ThumbsDown,
  WrenchOff,
  Zap,
} from "lucide-react";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { CANCELLED_CLASS, StatusDot, ToneBadge } from "@/components/tone-badge";
import { Badge } from "@/components/ui/badge";
import { WHATSAPP_BADGE_CLASS } from "@/components/whatsapp-badge";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/domain/money";
import {
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import {
  formatObservedProgress,
  PIECE_LOCATION_LABELS,
  RESTORATION_STATUS_LABELS,
  type ObservedProgress,
  type PieceLocation,
  type RestorationStatus,
} from "@/domain/restoration-status";
import {
  AGE_TONE_LABELS,
  statusAgeText,
  statusAgeTone,
  type AgeTone,
} from "@/domain/piece-status-age";
import {
  PAYMENT_STATUS_BADGE,
  PROGRESS_LABELS,
  RESTORATION_STATUS_PROGRESS,
  type BadgeProgress,
  type BadgeTone,
} from "@/domain/status-progress";
import { cn } from "@/lib/utils";

/**
 * Insignias de estado y ubicación (Pasos 7.6, 8.5 y 8.6). Siempre llevan el texto,
 * así el color no es la única pista. Los estados de la pieza usan los colores de la
 * Platería (P47), con contraste AA en tema claro y oscuro. Lo anulado va tenue y
 * tachado.
 */

type IconComponent = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

/**
 * Color e icono de cada estado de la pieza (P47; pedido del 2026-10-15): todas las
 * insignias de estado son de la misma familia, una píldora de fondo suave con un punto
 * del color del estado, así se leen igual en la tabla, el kanban y el detalle. Texto
 * con contraste AA (≥ 4.5:1) en tema claro y oscuro; el texto siempre acompaña, así
 * el color no es la única pista. Lo anulado va tenue y tachado. El icono se usa donde
 * no hay insignia (p. ej. la cabecera de una columna del kanban).
 */
export const PIECE_STATUS_STYLES: Record<
  PieceStatus,
  { className: string; dot: string; icon: IconComponent }
> = {
  registrada: {
    className:
      "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100",
    dot: "bg-slate-600 dark:bg-slate-400",
    icon: ClipboardList,
  },
  en_consulta: {
    className:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-100",
    dot: "bg-fuchsia-600 dark:bg-fuchsia-400",
    icon: MessageCircleQuestionMark,
  },
  en_espera: {
    className:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-600 dark:bg-violet-400",
    icon: Hourglass,
  },
  aprobada: {
    className:
      "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
    dot: "bg-green-600 dark:bg-green-400",
    icon: CircleCheck,
  },
  observada: {
    className:
      "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100",
    dot: "bg-yellow-600 dark:bg-yellow-400",
    icon: Eye,
  },
  entregada: {
    className:
      "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100",
    dot: "bg-blue-600 dark:bg-blue-400",
    icon: PackageCheck,
  },
  rechazada: {
    className:
      "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100",
    dot: "bg-orange-600 dark:bg-orange-400",
    icon: ThumbsDown,
  },
  sin_arreglo: {
    className:
      "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-100",
    dot: "bg-teal-600 dark:bg-teal-400",
    icon: WrenchOff,
  },
  anulada: {
    className:
      "border-gray-200 bg-gray-100 text-gray-600 line-through dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
    dot: "bg-gray-400",
    icon: Ban,
  },
};

/** Icono del estado de la pieza (decorativo: el texto del estado va al lado). */
export function PieceStatusIcon({
  status,
  className,
}: {
  status: PieceStatus;
  className?: string;
}) {
  const Icon = PIECE_STATUS_STYLES[status].icon;
  return <Icon aria-hidden className={className} />;
}

/**
 * Con `wrap`, las etiquetas largas van en dos líneas (tablas de columnas angostas:
 * "Espera respuesta cliente"); el resto de estados cabe en una. El corte es fijo y
 * sin ancho máximo: un texto que se parte solo deja la caja al ancho máximo, con
 * fondo de sobra a la derecha.
 */
export const WRAP_BADGE_CLASS =
  "h-auto justify-start rounded-xl text-left leading-tight";

const WRAPPED_LABELS: Partial<Record<PieceStatus, [string, string]>> = {
  en_espera: ["Espera respuesta", "cliente"],
};

export function PieceStatusBadge({
  status,
  wrap = false,
  className,
}: {
  status: PieceStatus;
  wrap?: boolean;
  className?: string;
}) {
  const style = PIECE_STATUS_STYLES[status];
  const lines = WRAPPED_LABELS[status];
  return (
    <Badge
      variant="outline"
      data-status={status}
      data-wrap={wrap || undefined}
      className={cn(style.className, wrap && WRAP_BADGE_CLASS, className)}
    >
      <StatusDot className={style.dot} />
      {wrap && lines ? (
        <span>
          {/* El espacio mantiene el texto completo para lectores y búsquedas. */}
          {`${lines[0]} `}
          <br />
          {lines[1]}
        </span>
      ) : (
        PIECE_STATUS_LABELS[status]
      )}
    </Badge>
  );
}

/**
 * Marca "Urgente" (P47): no es un estado. Amarilla como su rayo, en un ámbar claro
 * que no se confunde con el amarillo intenso de "Observada" (contraste AA).
 */
export function UrgentBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      data-urgent
      className={cn(
        "border-transparent bg-amber-300 text-amber-950",
        className,
      )}
    >
      <Zap aria-hidden />
      Urgente
    </Badge>
  );
}

/**
 * Solo el rayo amarillo de "Urgente", para las tablas: va al costado del código de la
 * pieza. El texto oculto lo dice a los lectores de pantalla y el `title` al pasar el
 * mouse.
 */
export function UrgentIcon({ className }: { className?: string }) {
  return (
    <span
      data-urgent
      title="Urgente"
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      <Zap aria-hidden className="size-4 fill-amber-400 text-amber-600" />
      <span className="sr-only">Urgente</span>
    </span>
  );
}

/**
 * Tono del estado general: en aprobación (info), listo para entregar (éxito),
 * completado (neutro, ya no pide nada), rechazado (crítico). El icono de progreso es el
 * indicador de la insignia.
 */
const RESTORATION_TONES: Record<RestorationStatus, BadgeTone> = {
  registrada: "neutral",
  parcialmente_aprobada: "info",
  aprobada: "info",
  parcialmente_lista: "success",
  lista: "success",
  completada: "neutral",
  anulada: "neutral",
  rechazada: "critical",
};

export function RestorationStatusBadge({
  status,
  className,
}: {
  status: RestorationStatus;
  className?: string;
}) {
  const progress = RESTORATION_STATUS_PROGRESS[status];
  return (
    <ToneBadge
      tone={RESTORATION_TONES[status]}
      data-status={status}
      indicator={progress ? <ProgressIcon progress={progress} /> : undefined}
      className={cn(status === "anulada" && CANCELLED_CLASS, className)}
    >
      {RESTORATION_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

/**
 * "2 de 4 piezas observadas": va al costado del estado de la restauración cuando al
 * menos una pieza está en Observación. Lleva el color de la insignia de la pieza
 * observada (amarillo), así se reconoce de un vistazo.
 */
export function ObservedBadge({
  progress,
  className,
}: {
  progress: ObservedProgress;
  className?: string;
}) {
  const style = PIECE_STATUS_STYLES.observada;
  return (
    <Badge
      variant="outline"
      data-observed
      className={cn(style.className, className)}
    >
      <StatusDot className={style.dot} />
      {formatObservedProgress(progress)}
    </Badge>
  );
}

/**
 * "2 en espera": piezas de la guía en Espera respuesta cliente, con el color y el
 * icono de esa insignia (violeta, reloj de arena). Solo se muestra si hay alguna.
 */
export function WaitingClientBadge({
  count,
  className,
  ...props
}: { count: number } & Omit<ComponentProps<typeof Badge>, "children">) {
  if (count <= 0) return null;
  const style = PIECE_STATUS_STYLES.en_espera;
  const Icon = style.icon;
  return (
    <Badge
      variant="outline"
      data-waiting
      {...props}
      title={`${count} ${count === 1 ? "pieza espera" : "piezas esperan"} la respuesta del cliente`}
      className={cn("tabular-nums", style.className, className)}
    >
      <Icon aria-hidden />
      {count} en espera
    </Badge>
  );
}

/**
 * La ubicación no es un estado: insignia neutra con el icono del lugar, para no
 * competir con el color del estado de la pieza.
 */
const LOCATIONS: Record<
  PieceLocation,
  ComponentType<{ "aria-hidden"?: boolean }>
> = {
  por_whatsapp: WhatsAppIcon,
  sin_enviar: PackageSearch,
  en_tienda: Store,
  en_taller: Hammer,
  entregada: PackageCheck,
  anulada: Ban,
};

export function LocationBadge({
  location,
  className,
}: {
  location: PieceLocation;
  className?: string;
}) {
  const Icon = LOCATIONS[location];
  return (
    <Badge
      variant="outline"
      data-location={location}
      className={cn(
        "text-foreground [&>svg]:text-muted-foreground",
        location === "anulada" && CANCELLED_CLASS,
        location === "por_whatsapp" && WHATSAPP_BADGE_CLASS,
        className,
      )}
    >
      <Icon aria-hidden />
      {PIECE_LOCATION_LABELS[location]}
    </Badge>
  );
}

/**
 * Progreso de una insignia (S5): círculo vacío, a medias o lleno. Lleva un texto
 * para lectores de pantalla, así el avance no depende del color.
 */
export function ProgressIcon({ progress }: { progress: BadgeProgress | null }) {
  if (!progress) return null;
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-3 shrink-0"
      role="img"
      aria-label={PROGRESS_LABELS[progress]}
      data-progress={progress}
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill={progress === "complete" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={progress === "incomplete" ? "2 1.5" : undefined}
      />
      {progress === "partial" ? (
        <path d="M6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="currentColor" />
      ) : null}
    </svg>
  );
}

/** Estado de pago con tono y progreso: Pendiente ○, Parcial ◐, Pagado ● (S5). */
export function PaymentStatusBadge({
  status,
  className,
  ...props
}: { status: PaymentStatus } & Omit<ComponentProps<"span">, "children">) {
  const { tone, progress } = PAYMENT_STATUS_BADGE[status];
  return (
    <ToneBadge
      tone={tone}
      data-payment-status={status}
      indicator={progress ? <ProgressIcon progress={progress} /> : undefined}
      className={className}
      {...props}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </ToneBadge>
  );
}

const compactDays = (days: number) =>
  days === 0 ? "Hoy" : `${days} ${days === 1 ? "día" : "días"}`;

const AGE_CLASSES: Record<AgeTone, string> = {
  neutral: "text-muted-foreground",
  attention: "text-amber-800 dark:text-amber-300 font-medium",
  critical: "text-destructive font-medium",
};

/**
 * Días en el estado actual con semáforo (C5): neutro, atención o crítico según los
 * umbrales del estado. El icono y el texto oculto dicen el tono sin depender del color.
 */
export function StatusAge({
  piece,
  compact = false,
  className,
}: {
  piece: {
    status: PieceStatus;
    readyForDelivery?: boolean;
    /** En el taller por trabajo (Aprobada u Observada): umbrales del taller. */
    location?: PieceLocation;
    statusDays: number;
  };
  /** Solo "Hoy" o "N días", para una columna que ya dice "en el estado". */
  compact?: boolean;
  className?: string;
}) {
  const inWorkshop =
    (piece.status === "aprobada" || piece.status === "observada") &&
    piece.location === "en_taller";
  const tone = statusAgeTone({ ...piece, inWorkshop }, piece.statusDays);
  const Icon = tone === "neutral" ? Clock : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        AGE_CLASSES[tone],
        className,
      )}
      data-testid="dias-en-estado"
      data-tone={tone}
    >
      <Icon className="size-3.5" aria-hidden />
      {compact
        ? compactDays(piece.statusDays)
        : statusAgeText(piece.statusDays)}
      {tone === "neutral" ? null : (
        <span className="sr-only"> ({AGE_TONE_LABELS[tone]})</span>
      )}
    </span>
  );
}
