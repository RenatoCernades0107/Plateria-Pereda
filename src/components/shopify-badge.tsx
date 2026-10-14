import type { ComponentProps } from "react";

import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Tinte verde de Shopify para una insignia: fondo y borde con el verde de Shopify
 * (#95BF47), ícono en su verde oscuro (#5E8E3E) y texto en un verde más oscuro para
 * el contraste AA (7.2:1 en claro; 9.7:1 en oscuro).
 */
export const SHOPIFY_BADGE_CLASS =
  "border-shopify/60 bg-shopify/15 text-shopify-foreground [&>svg]:text-shopify-strong";

/** Insignia con el ícono y el verde de Shopify (orden, origen, estado, etc.). */
export function ShopifyBadge({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant" | "asChild">) {
  return (
    <Badge
      variant="outline"
      className={cn(SHOPIFY_BADGE_CLASS, className)}
      {...props}
    >
      <ShopifyIcon />
      {children}
    </Badge>
  );
}
