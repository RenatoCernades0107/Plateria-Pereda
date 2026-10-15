import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pantalla de estado (403, 404, error): código pequeño, título, explicación y acción.
 * Ocupa toda la ventana fuera del menú (`fullScreen`) o el área de contenido dentro.
 */
export function StatusPage({
  code,
  title,
  children,
  action,
  fullScreen = false,
}: {
  code: string;
  title: string;
  children: ReactNode;
  action: ReactNode;
  fullScreen?: boolean;
}) {
  // Dentro del menú ya hay un <main> (el del contenido): no se anida otro.
  const Root = fullScreen ? "main" : "div";
  return (
    <Root
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-6 text-center",
        fullScreen ? "min-h-svh" : "min-h-[60svh]",
      )}
    >
      <p className="text-brand text-sm font-semibold tracking-widest">{code}</p>
      <h1 className="text-heading text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{children}</p>
      <div className="flex flex-wrap justify-center gap-2">{action}</div>
    </Root>
  );
}
