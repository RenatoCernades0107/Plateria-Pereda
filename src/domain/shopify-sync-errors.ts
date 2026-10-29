/**
 * Aviso al admin de las sincronizaciones con Shopify que quedaron en error (Paso 15.4).
 * Un job en error deja de contar si después se completó otro del mismo tipo para el
 * mismo registro (p. ej., una edición de la orden posterior que sí pasó).
 */

export type SyncJobRow = {
  id: number;
  kind: string;
  entityTable: string;
  entityId: string;
  status: string;
  createdAt: string;
};

export type SyncErrorLink = {
  jobId: number;
  label: string;
  href: string | null;
};

const key = (job: SyncJobRow) =>
  `${job.kind}:${job.entityTable}:${job.entityId}`;

/** Jobs en error que siguen vigentes (sin uno posterior completado). */
export function openSyncErrors(jobs: readonly SyncJobRow[]): SyncJobRow[] {
  const lastOk = new Map<string, string>();
  for (const job of jobs) {
    if (job.status !== "ok") continue;
    const current = lastOk.get(key(job));
    if (!current || job.createdAt > current)
      lastOk.set(key(job), job.createdAt);
  }
  return jobs.filter((job) => {
    if (job.status !== "error") return false;
    const ok = lastOk.get(key(job));
    return !ok || ok < job.createdAt;
  });
}

const KIND_LABELS: Record<string, string> = {
  "customer.create": "Crear cliente",
  "customer.update": "Actualizar cliente",
  "company.create": "Crear empresa",
  "company.update": "Actualizar empresa",
  "contact.create": "Crear contacto",
  "contact.update": "Actualizar contacto",
  "order.create": "Crear orden",
  "order.edit": "Editar orden",
  "order.fulfill": "Entregar orden",
  "payment.sync": "Registrar pago",
};

/** Texto y enlace de cada error; `names` y `clientOf` vienen de la BD. */
export function syncErrorLink(
  job: SyncJobRow,
  names: ReadonlyMap<string, string>,
  clientOf: ReadonlyMap<string, string>,
): SyncErrorLink {
  const action = KIND_LABELS[job.kind] ?? job.kind;
  const name = names.get(job.entityId);
  const label = name ? `${action}: ${name}` : action;
  if (job.entityTable === "restorations") {
    return { jobId: job.id, label, href: `/restauraciones/${job.entityId}` };
  }
  if (job.entityTable === "clients") {
    return { jobId: job.id, label, href: `/clientes/${job.entityId}` };
  }
  if (job.entityTable === "contacts") {
    const clientId = clientOf.get(job.entityId);
    return {
      jobId: job.id,
      label,
      href: clientId ? `/clientes/${clientId}` : null,
    };
  }
  return { jobId: job.id, label, href: null };
}
