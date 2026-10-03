import { Badge } from "@/components/ui/badge";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/domain/audit";

const VARIANTS = {
  insert: "secondary",
  update: "outline",
  delete: "destructive",
} as const;

export function ActionBadge({ action }: { action: AuditAction }) {
  return (
    <Badge variant={VARIANTS[action]}>{AUDIT_ACTION_LABELS[action]}</Badge>
  );
}
