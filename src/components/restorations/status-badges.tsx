import { Ban, Hammer, PackageCheck, PackageSearch, Store } from "lucide-react";

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
 * Insignias de estado y ubicación (Pasos 7.6 y 8.5). Usan las variantes de `Badge`
 * (todas con contraste AA en el tema) y siempre llevan el texto, así el color no es
 * la única pista. Lo anulado va tenue y tachado.
 */

type Variant = "default" | "secondary" | "destructive" | "outline";

const CANCELLED = "text-muted-foreground line-through";

const PIECE_VARIANTS: Record<PieceStatus, Variant> = {
  registrada: "outline",
  en_consulta: "secondary",
  en_espera: "secondary",
  aprobada: "secondary",
  recibida: "secondary",
  enviada_taller: "default",
  devuelta_taller: "default",
  observada: "destructive",
  entregada: "default",
  anulada: "outline",
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
      variant={PIECE_VARIANTS[status]}
      data-status={status}
      className={cn(status === "anulada" && CANCELLED, className)}
    >
      {PIECE_STATUS_LABELS[status]}
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
      className={cn(status === "anulada" && CANCELLED, className)}
    >
      {RESTORATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const LOCATIONS: Record<
  PieceLocation,
  { variant: Variant; icon: typeof Store }
> = {
  por_recibir: { variant: "outline", icon: PackageSearch },
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
