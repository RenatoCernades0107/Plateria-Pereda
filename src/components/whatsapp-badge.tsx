import type { ComponentProps } from "react";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Tinte verde de WhatsApp para una insignia; el texto conserva su color (contraste AA). */
export const WHATSAPP_BADGE_CLASS =
  "border-whatsapp/50 bg-whatsapp/10 [&>svg]:text-whatsapp-strong";

/** Insignia con el ícono y el verde de WhatsApp (origen, ubicación, etc.). */
export function WhatsAppBadge({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant" | "asChild">) {
  return (
    <Badge
      variant="outline"
      className={cn(WHATSAPP_BADGE_CLASS, className)}
      {...props}
    >
      <WhatsAppIcon />
      {children}
    </Badge>
  );
}
