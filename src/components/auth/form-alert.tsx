import { cn } from "@/lib/utils";

export function FormAlert({
  children,
  variant = "error",
}: {
  children: React.ReactNode;
  variant?: "error" | "info";
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        variant === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground",
      )}
    >
      {children}
    </div>
  );
}
