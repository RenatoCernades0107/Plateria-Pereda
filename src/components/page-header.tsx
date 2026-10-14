import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  /** Ícono decorativo antes del título (p. ej., el de WhatsApp). */
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-heading flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {icon}
        {title}
      </h1>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
  );
}
