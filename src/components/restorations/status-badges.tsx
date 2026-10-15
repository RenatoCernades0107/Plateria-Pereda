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
  Wrench,
  WrenchOff,
  Zap,
} from "lucide-react";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Badge } from "@/components/ui/badge";
import { WHATSAPP_BADGE_CLASS } from "@/components/whatsapp-badge";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/domain/money";
import {
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import {
  PIECE_LOCATION_LABELS,
  RESTORATION_STATUS_LABELS,
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

type Variant = "default" | "secondary" | "destructive" | "outline";

const CANCELLED = "text-muted-foreground line-through";

type IconComponent = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

/**
 * Color e icono de cada estado de la pieza (P47 y pedido del 2026-10-14): todos los
 * estados tienen un color propio y un icono, para reconocerlos de un vistazo. Fondo
 * sólido con texto con contraste AA (≥ 4.5:1) en tema claro y oscuro; el texto
 * siempre acompaña, así el color no es la única pista. Lo anulado va tenue y tachado.
 */
export const PIECE_STATUS_STYLES: Record<
  PieceStatus,
  { className: string; icon: IconComponent }
> = {
  registrada: {
    className: "border-transparent bg-slate-600 text-white",
    icon: ClipboardList,
  },
  en_consulta: {
    className: "border-transparent bg-fuchsia-700 text-white",
    icon: MessageCircleQuestionMark,
  },
  en_espera: {
    className: "border-transparent bg-purple-700 text-white",
    icon: Hourglass,
  },
  aprobada: {
    className: "border-transparent bg-green-700 text-white",
    icon: CircleCheck,
  },
  enviada_taller: {
    className:
      "border-transparent bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-sky-50",
    icon: Wrench,
  },
  observada: {
    className: "border-transparent bg-yellow-500 text-yellow-950",
    icon: Eye,
  },
  entregada: {
    className: "border-transparent bg-blue-700 text-white",
    icon: PackageCheck,
  },
  rechazada: {
    className: "border-transparent bg-amber-900 text-white",
    icon: ThumbsDown,
  },
  sin_arreglo: {
    className: "border-transparent bg-teal-800 text-white",
    icon: WrenchOff,
  },
  anulada: {
    className:
      "border-transparent bg-gray-200 text-gray-700 line-through dark:bg-gray-700 dark:text-gray-200",
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

export function PieceStatusBadge({
  status,
  className,
}: {
  status: PieceStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      data-status={status}
      className={cn(PIECE_STATUS_STYLES[status].className, className)}
    >
      <PieceStatusIcon status={status} />
      {PIECE_STATUS_LABELS[status]}
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

const RESTORATION_VARIANTS: Record<RestorationStatus, Variant> = {
  registrada: "outline",
  parcialmente_aprobada: "secondary",
  aprobada: "secondary",
  parcialmente_lista: "default",
  lista: "default",
  completada: "default",
  anulada: "outline",
  rechazada: "outline",
};

export function RestorationStatusBadge({
  status,
  className,
}: {
  status: RestorationStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={RESTORATION_VARIANTS[status]}
      data-status={status}
      className={cn(
        status === "anulada" && CANCELLED,
        status === "rechazada" && "border-transparent bg-amber-900 text-white",
        // A medio aprobar: borde punteado para distinguirla de Aprobada.
        status === "parcialmente_aprobada" &&
          "border-foreground/40 border-dashed",
        className,
      )}
    >
      <ProgressIcon progress={RESTORATION_STATUS_PROGRESS[status]} />
      {RESTORATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const LOCATIONS: Record<
  PieceLocation,
  { variant: Variant; icon: ComponentType<{ "aria-hidden"?: boolean }> }
> = {
  por_whatsapp: { variant: "outline", icon: WhatsAppIcon },
  sin_enviar: { variant: "outline", icon: PackageSearch },
  en_tienda: { variant: "secondary", icon: Store },
  en_taller: { variant: "default", icon: Hammer },
  entregada: { variant: "outline", icon: PackageCheck },
  anulada: { variant: "outline", icon: Ban },
};

export function LocationBadge({
  location,
  className,
}: {
  location: PieceLocation;
  className?: string;
}) {
  const { variant, icon: Icon } = LOCATIONS[location];
  return (
    <Badge
      variant={variant}
      data-location={location}
      className={cn(
        location === "anulada" && CANCELLED,
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

const TONES: Record<BadgeTone, string> = {
  neutral: "border-border text-foreground",
  info: "border-transparent bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-sky-50",
  success:
    "border-transparent bg-green-100 text-green-950 dark:bg-green-900 dark:text-green-50",
  attention:
    "border-transparent bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50",
  critical:
    "border-transparent bg-red-100 text-red-950 dark:bg-red-900 dark:text-red-50",
};

/** Estado de pago con tono y progreso: Pendiente ○, Parcial ◐, Pagado ● (S5). */
export function PaymentStatusBadge({
  status,
  className,
  ...props
}: { status: PaymentStatus } & Omit<ComponentProps<"span">, "children">) {
  const { tone, progress } = PAYMENT_STATUS_BADGE[status];
  return (
    <Badge
      variant="outline"
      data-payment-status={status}
      data-tone={tone}
      className={cn(TONES[tone], className)}
      {...props}
    >
      <ProgressIcon progress={progress} />
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
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
    statusDays: number;
  };
  /** Solo "Hoy" o "N días", para una columna que ya dice "en el estado". */
  compact?: boolean;
  className?: string;
}) {
  const tone = statusAgeTone(piece, piece.statusDays);
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
