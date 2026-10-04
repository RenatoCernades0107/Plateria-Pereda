"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { retryShopifyJob } from "@/server/shopify-sync/actions";
import type { SyncJobStatus } from "@/server/shopify-sync/jobs";

const LABELS: Record<SyncJobStatus, string> = {
  ok: "Sincronizado",
  pending: "Pendiente",
  processing: "Pendiente",
  error: "Error",
};

const VARIANTS = {
  ok: "secondary",
  pending: "outline",
  processing: "outline",
  error: "destructive",
} as const;

/** Estado de sincronización con Shopify de un registro, con "Reintentar" si falló. */
export function SyncStatus({
  jobId,
  status,
  lastError,
  canRetry = true,
}: {
  /** null: sin job (importado de Shopify); no se puede reintentar. */
  jobId: number | null;
  status: SyncJobStatus;
  lastError?: string | null;
  canRetry?: boolean;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const badge = (
    <Badge variant={VARIANTS[status]} data-testid="estado-shopify">
      Shopify: {LABELS[status]}
    </Badge>
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {lastError && status !== "ok" ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{badge}</span>
            </TooltipTrigger>
            <TooltipContent>{lastError}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        badge
      )}
      {status === "error" && canRetry && jobId !== null ? (
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
}
