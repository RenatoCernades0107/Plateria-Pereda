"use client";

import type { ReactNode } from "react";

import { FilterFormActions } from "@/components/filter-form-actions";
import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLiveFilters } from "@/components/use-live-filters";
import {
  clientFiltersHref,
  parseClientFilters,
  type ClientFilters,
} from "@/domain/client-filters";

const ALL = "todos";

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  allLabel = "Todos",
}: {
  id: string;
  label: ReactNode;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
  allLabel?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? null : v)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
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

/** Búsqueda y filtros del listado de clientes (en la URL; se aplican solos). */
export function ClientsFiltersForm({ filters }: { filters: ClientFilters }) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => clientFiltersHref(f, { page: 1 }),
  );
  const set = (patch: Partial<ClientFilters>) => update(patch);

  return (
    <form
      aria-label="Filtros de clientes"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
      onSubmit={submit}
    >
      <div className="space-y-1.5">
        <Label htmlFor="filtro-texto">
          Nombre, documento, teléfono o email
        </Label>
        <Input
          id="filtro-texto"
          type="search"
          value={state.q}
          maxLength={100}
          placeholder="Escribe para buscar"
          onChange={(e) => update({ q: e.target.value }, { debounce: true })}
        />
      </div>
      <FilterSelect
        id="filtro-tipo"
        label="Tipo"
        value={state.kind}
        options={[
          { value: "persona", label: "Personas" },
          { value: "empresa", label: "Empresas" },
        ]}
        onChange={(kind) => set({ kind: kind as ClientFilters["kind"] })}
      />
      <FilterSelect
        id="filtro-sync"
        label={
          <>
            <ShopifyIcon className="text-shopify-strong size-4" />
            Shopify
          </>
        }
        value={state.sync}
        options={[
          { value: "ok", label: "Sincronizado" },
          { value: "pending", label: "Pendiente" },
          { value: "error", label: "Con error" },
        ]}
        onChange={(sync) => set({ sync: sync as ClientFilters["sync"] })}
      />
      <FilterSelect
        id="filtro-estado"
        label="Estado"
        value={state.status === "todos" ? null : state.status}
        allLabel="Todos"
        options={[
          { value: "activos", label: "Activos" },
          { value: "inactivos", label: "Inactivos" },
        ]}
        onChange={(status) =>
          set({ status: (status ?? "todos") as ClientFilters["status"] })
        }
      />
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parseClientFilters({}))}
      />
    </form>
  );
}
