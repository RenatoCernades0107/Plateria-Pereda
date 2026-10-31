"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { SHOPIFY_BADGE_CLASS } from "@/components/shopify-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { explainSyncError } from "@/domain/shopify-sync-messages";
import { cn } from "@/lib/utils";
import { retryShopifyJob } from "@/server/shopify-sync/actions";
import type { SyncJobStatus } from "@/server/shopify-sync/jobs";

const LABELS: Record<SyncJobStatus, string> = {
  ok: "Sincronizado",
  pending: "Pendiente",
  processing: "Pendiente",
  error: "Error",
};

const VARIANTS = {
  ok: "outline",
  pending: "outline",
  processing: "outline",
  error: "destructive",
} as const;

/**
 * Siempre con el logotipo de Shopify: sincronizado lleva el verde de Shopify;
 * pendiente, solo el ícono en verde; con error, el rojo de error (ícono incluido).
 */
const CLASSES: Record<SyncJobStatus, string | undefined> = {
  ok: SHOPIFY_BADGE_CLASS,
  pending: "[&>svg]:text-shopify-strong",
  processing: "[&>svg]:text-shopify-strong",
  error: undefined,
};

/** Qué pasó y qué hacer, en español; el mensaje original de Shopify va aparte. */
function ErrorExplanation({ message }: { message: string }) {
  const { problem, fix, original } = explainSyncError(message);
  return (
    <span className="block space-y-1">
      <span className="block">{problem}</span>
      <span className="block">
        <span className="font-medium">Qué hacer: </span>
        {fix}
      </span>
      {original ? (
        <span className="block text-xs opacity-75">
          Mensaje de Shopify: {original}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Estado de sincronización con Shopify de un registro, con "Reintentar" si falló. El
 * motivo se explica en español: al pasar sobre el estado o, en la ficha del registro
 * (`detail="inline"`), escrito debajo cuando quedó en error.
 */
export function SyncStatus({
  jobId,
  status,
  lastError,
  canRetry = true,
  detail = "tooltip",
}: {
  /** null: sin job (importado de Shopify); no se puede reintentar. */
  jobId: number | null;
  status: SyncJobStatus;
  lastError?: string | null;
  canRetry?: boolean;
  detail?: "tooltip" | "inline";
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const inline = detail === "inline" && status === "error";
  const withDetail = Boolean(lastError) && status !== "ok" && !inline;
  // Un pendiente que ya falló espera su próximo intento: se puede adelantar.
  const retryable =
    status === "error" || (status === "pending" && Boolean(lastError));
  // Con detalle del error, el cursor de ayuda indica que hay más información.
  const badge = (
    <Badge
      variant={VARIANTS[status]}
      data-testid="estado-shopify"
      data-status={status}
      className={cn(CLASSES[status], withDetail && "cursor-help")}
    >
      <ShopifyIcon />
      Shopify: {LABELS[status]}
    </Badge>
  );

  const controls = (
    <span className="inline-flex flex-wrap items-center gap-2">
      {withDetail ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{badge}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <ErrorExplanation message={lastError!} />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        badge
      )}
      {retryable && canRetry && jobId !== null ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await retryShopifyJob(jobId!, pathname);
              if ("error" in result) toast.error(result.error);
              else toast.success("Reintentando la sincronización con Shopify.");
            })
          }
        >
          <RefreshCw className={pending ? "animate-spin" : undefined} />
          Reintentar
        </Button>
      ) : null}
    </span>
  );
  if (!inline) return controls;
  return (
    <span className="block w-full max-w-prose space-y-2">
      {controls}
      <span
        role="note"
        className="border-destructive/30 bg-destructive/5 block rounded-md border p-3 text-sm"
      >
        <ErrorExplanation message={lastError ?? ""} />
      </span>
    </span>
  );
}
