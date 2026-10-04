"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/domain/audit";
import {
  auditHref,
  SYSTEM_ACTOR_FILTER,
  type AuditFilters,
} from "@/lib/audit-filters";

const ALL = "todos";

type Option = { value: string; label: string };

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: Option[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? undefined : v)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AuditFiltersForm({
  filters,
  actors,
  entities,
}: {
  filters: AuditFilters;
  actors: Option[];
  entities: Option[];
}) {
  const router = useRouter();
  const [state, setState] = useState(filters);
  const set = (patch: Partial<AuditFilters>) =>
    setState((s) => ({ ...s, ...patch }));

  return (
    <form
      aria-label="Filtros de auditoría"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(auditHref({ ...state, page: 1 }));
      }}
    >
      <FilterSelect
        id="filtro-usuario"
        label="Usuario"
        value={state.actor}
        options={[
          ...actors,
          { value: SYSTEM_ACTOR_FILTER, label: "Sistema / Shopify" },
        ]}
        onChange={(actor) => set({ actor })}
      />
      <FilterSelect
        id="filtro-entidad"
        label="Entidad"
        value={state.entity}
        options={entities}
        onChange={(entity) => set({ entity })}
      />
      <FilterSelect
        id="filtro-accion"
        label="Acción"
        value={state.action}
        options={Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
        onChange={(action) =>
          set({ action: action as AuditAction | undefined })
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
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setState({ page: 1 });
            router.push("/auditoria");
          }}
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
