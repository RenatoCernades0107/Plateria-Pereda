"use client";

import { FilterMulti } from "@/components/filter-multi";
import { FilterFormActions } from "@/components/filter-form-actions";
import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveFilters } from "@/components/use-live-filters";
import {
  clientFiltersHref,
  parseClientFilters,
  type ClientFilters,
} from "@/domain/client-filters";

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
      <FilterMulti
        id="filtro-tipo"
        label="Tipo"
        value={state.kind}
        options={[
          { value: "persona", label: "Personas" },
          { value: "empresa", label: "Empresas" },
        ]}
        onChange={(kind) => set({ kind })}
      />
      <FilterMulti
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
        onChange={(sync) => set({ sync })}
      />
      <FilterMulti
        id="filtro-estado"
        label="Estado"
        value={state.status}
        options={[
          { value: "activos", label: "Activos" },
          { value: "inactivos", label: "Inactivos" },
        ]}
        onChange={(status) => set({ status })}
      />
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parseClientFilters({}))}
      />
    </form>
  );
}
