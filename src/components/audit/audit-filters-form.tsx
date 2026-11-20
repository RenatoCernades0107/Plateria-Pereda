"use client";

import { FilterMulti } from "@/components/filter-multi";
import { FilterFormActions } from "@/components/filter-form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveFilters } from "@/components/use-live-filters";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/domain/audit";
import {
  auditHref,
  SYSTEM_ACTOR_FILTER,
  type AuditFilters,
} from "@/lib/audit-filters";

type Option = { value: string; label: string };

export function AuditFiltersForm({
  filters,
  actors,
  entities,
}: {
  filters: AuditFilters;
  actors: Option[];
  entities: Option[];
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => auditHref({ ...f, page: 1 }),
  );
  const set = (patch: Partial<AuditFilters>) => update(patch);

  return (
    <form
      aria-label="Filtros de auditoría"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
      onSubmit={submit}
    >
      <FilterMulti
        id="filtro-usuario"
        label="Usuario"
        value={state.actor ?? []}
        options={[
          ...actors,
          { value: SYSTEM_ACTOR_FILTER, label: "Sistema / Shopify" },
        ]}
        onChange={(actor) => set({ actor: actor.length ? actor : undefined })}
      />
      <FilterMulti
        id="filtro-entidad"
        label="Entidad"
        value={state.entity ?? []}
        options={entities}
        onChange={(entity) =>
          set({ entity: entity.length ? entity : undefined })
        }
      />
      <FilterMulti
        id="filtro-accion"
        label="Acción"
        value={state.action ?? []}
        options={Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
          value: value as AuditAction,
          label,
        }))}
        onChange={(action) =>
          set({ action: action.length ? action : undefined })
        }
      />
      <div className="space-y-1.5">
        <Label htmlFor="filtro-desde">Desde</Label>
        <Input
          id="filtro-desde"
          type="date"
          value={state.from ?? ""}
          max={state.to}
          onChange={(e) => set({ from: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-hasta">Hasta</Label>
        <Input
          id="filtro-hasta"
          type="date"
          value={state.to ?? ""}
          min={state.from}
          onChange={(e) => set({ to: e.target.value || undefined })}
        />
      </div>
      <FilterFormActions pending={pending} onReset={() => reset({ page: 1 })} />
    </form>
  );
}
