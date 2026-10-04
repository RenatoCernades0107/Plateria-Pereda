import { can } from "@/domain/permissions";
import { getEntityHistory } from "@/server/audit";
import { requireUser } from "@/server/auth";

import { EntityHistory } from "./entity-history";

/** Carga y muestra el historial de un registro; logística no lo ve (P42). */
export async function EntityHistorySection({
  table,
  recordId,
}: {
  table: string;
  recordId: string;
}) {
  const user = await requireUser();
  if (!can(user.role, "historial.ver")) return null;
  return <EntityHistory entries={await getEntityHistory(table, recordId)} />;
}
