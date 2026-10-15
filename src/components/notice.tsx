import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  info: "border-border bg-muted text-foreground",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

/**
 * Aviso de una página (algo que falta hacer o que salió mal). `destructive` se anuncia
 * de inmediato (`role="alert"`); `info`, con cortesía (`role="status"`).
 */
export function Notice({
  tone = "info",
  children,
  className,
  ...props
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"div">, "role">) {
  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      className={cn("rounded-md border p-3 text-sm", TONES[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}
