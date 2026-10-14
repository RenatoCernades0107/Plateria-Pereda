"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { Button } from "@/components/ui/button";
import { resyncPayments } from "@/server/payments/actions";

/** "Resincronizar pagos" (admin, Paso 11.4). */
export function ResyncPaymentsButton({
  restorationId,
}: {
  restorationId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resyncPayments(restorationId);
          if ("error" in result) toast.error(result.error);
          else toast.success("Resincronizando los pagos con Shopify.");
        })
      }
    >
      {pending ? (
        <RefreshCw className="animate-spin" />
      ) : (
        <ShopifyIcon className="text-shopify-strong" />
      )}
      Resincronizar pagos
    </Button>
  );
}
