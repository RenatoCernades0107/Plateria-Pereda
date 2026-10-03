import { describeChanges, type AuditEntry } from "@/domain/audit";

export function ChangeList({ entry }: { entry: AuditEntry }) {
  const lines = describeChanges(entry.table, entry.action, entry.changes);
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-sm">
      {lines.map((line) => (
        <li key={line} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  );
}
