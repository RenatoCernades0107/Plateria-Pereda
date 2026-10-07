import {
  Ban,
  Hammer,
  MessageCircle,
  PackageCheck,
  PackageSearch,
  Store,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

/**
 * Insignias de estado y ubicación (Pasos 7.6, 8.5 y 8.6). Siempre llevan el texto,
 * así el color no es la única pista. Los estados de la pieza usan los colores de la
 * Platería (P47), con contraste AA en tema claro y oscuro. Lo anulado va tenue y
 * tachado.
 */

type Variant = "default" | "secondary" | "destructive" | "outline";

const CANCELLED = "text-muted-foreground line-through";

/** Colores de la Platería (P47); `null` = variante del tema. */
const PIECE_COLORS: Record<PieceStatus, string | null> = {
  registrada: null,
  en_consulta: "border-transparent bg-fuchsia-700 text-white",
  en_espera: "border-transparent bg-purple-700 text-white",
  aprobada: "border-transparent bg-green-700 text-white",
  enviada_taller:
    "border-transparent bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-sky-50",
  observada: "border-transparent bg-yellow-500 text-yellow-950",
  entregada: null,
  rechazada: "border-transparent bg-amber-900 text-white",
  sin_arreglo: "border-transparent bg-teal-800 text-white",
  anulada:
    "border-transparent bg-gray-200 text-gray-700 line-through dark:bg-gray-700 dark:text-gray-200",
};

const PIECE_VARIANTS: Partial<Record<PieceStatus, Variant>> = {
  registrada: "outline",
  entregada: "default",
};

export function PieceStatusBadge({
  status,
  className,
}: {
  status: PieceStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={PIECE_VARIANTS[status] ?? "outline"}
      data-status={status}
      className={cn(PIECE_COLORS[status], className)}
    >
      {PIECE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Marca "Urgente" (P47): no es un estado. */
export function UrgentBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      data-urgent
      className={cn("border-transparent bg-cyan-300 text-cyan-950", className)}
    >
      <Zap aria-hidden />
      Urgente
    </Badge>
  );
}

const RESTORATION_VARIANTS: Record<RestorationStatus, Variant> = {
  registrada: "outline",
  aprobada: "secondary",
  en_proceso: "secondary",
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
        className,
      )}
    >
      {RESTORATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const LOCATIONS: Record<
  PieceLocation,
  { variant: Variant; icon: typeof Store }
> = {
  por_whatsapp: { variant: "outline", icon: MessageCircle },
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
      className={cn(location === "anulada" && CANCELLED, className)}
    >
      <Icon aria-hidden />
      {PIECE_LOCATION_LABELS[location]}
    </Badge>
  );
}
