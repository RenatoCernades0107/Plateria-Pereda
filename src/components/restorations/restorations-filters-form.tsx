"use client";

import { ChevronDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClientPicker } from "@/components/clients/client-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import type { ClientOption } from "@/domain/client-search";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
} from "@/domain/money";
import {
  parseRestorationFilters,
  restorationFiltersHref,
  type RestorationFilters,
} from "@/domain/restoration-filters";
import {
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
  RESTORATION_ORIGIN_LABELS,
  RESTORATION_ORIGINS,
} from "@/domain/restoration-status";

function FilterMulti<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T[];
  options: { value: T; label: string }[];
  onChange: (value: T[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <MultiSelect
        id={id}
        options={options}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

/** Búsqueda y filtros del listado de restauraciones (se guardan en la URL). */
export function RestorationsFiltersForm({
  filters,
  clientName,
  workshops,
  showMoney,
}: {
  filters: RestorationFilters;
  clientName: string | null;
  workshops: { id: string; name: string }[];
  /** El estado de pago solo para admin y ventas (P42). */
  showMoney: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(filters);
  const [client, setClient] = useState<{ id: string; name: string } | null>(
    filters.clientId && clientName
      ? { id: filters.clientId, name: clientName }
      : null,
  );
  // Los filtros secundarios se ocultan, salvo que alguno ya esté aplicado.
  const hiddenActive = [
    filters.paymentType.length > 0,
    filters.origin.length > 0,
    filters.workshopIds.length > 0,
    filters.from !== null,
    filters.to !== null,
  ].filter(Boolean).length;
  const [showMore, setShowMore] = useState(hiddenActive > 0);
  const set = (patch: Partial<RestorationFilters>) =>
    setState((s) => ({ ...s, ...patch }));

  const chooseClient = (option: ClientOption) => {
    if (option.source !== "local") return;
    const name = option.kind === "contacto" ? option.companyName : option.name;
    setClient({ id: option.clientId, name });
    set({ clientId: option.clientId });
  };

  const statusOptions = RESTORATION_STATUSES.map((s) => ({
    value: s,
    label: RESTORATION_STATUS_LABELS[s],
  }));

  return (
    <form
      aria-label="Filtros de restauraciones"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(restorationFiltersHref(state, { page: 1 }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-texto">Código, cliente o documento</Label>
          <Input
            id="filtro-texto"
            type="search"
            value={state.q}
            maxLength={100}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
        <FilterMulti
          id="filtro-estado"
          label="Estado"
          value={state.status}
          options={statusOptions}
          onChange={(status) => set({ status })}
        />
        {showMoney ? (
          <FilterMulti
            id="filtro-pago"
            label="Estado de pago"
            value={state.paymentStatus}
            options={PAYMENT_STATUSES.map((s) => ({
              value: s,
              label: PAYMENT_STATUS_LABELS[s],
            }))}
            onChange={(paymentStatus) => set({ paymentStatus })}
          />
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="filtro-cliente">Cliente</Label>
          {client ? (
            <div className="flex h-9 items-center gap-1 rounded-md border px-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{client.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Quitar filtro de cliente"
                onClick={() => {
                  setClient(null);
                  set({ clientId: null });
                }}
              >
                <X aria-hidden />
              </Button>
            </div>
          ) : (
            <ClientPicker
              id="filtro-cliente"
              placeholder="Todos los clientes"
              onSelect={chooseClient}
            />
          )}
        </div>
      </div>

      {showMore ? (
        <div
          id="filtros-adicionales"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <FilterMulti
            id="filtro-tipo"
            label="Tipo de pago"
            value={state.paymentType}
            options={PAYMENT_TYPES.map((t) => ({
              value: t,
              label: PAYMENT_TYPE_LABELS[t],
            }))}
            onChange={(paymentType) => set({ paymentType })}
          />
          <FilterMulti
            id="filtro-origen"
            label="Origen"
            value={state.origin}
            options={RESTORATION_ORIGINS.map((o) => ({
              value: o,
              label: RESTORATION_ORIGIN_LABELS[o],
            }))}
            onChange={(origin) => set({ origin })}
          />
          <FilterMulti
            id="filtro-taller"
            label="Taller"
            value={state.workshopIds}
            options={workshops.map((w) => ({ value: w.id, label: w.name }))}
            onChange={(workshopIds) => set({ workshopIds })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="filtro-desde">Desde</Label>
            <Input
              id="filtro-desde"
              type="date"
              value={state.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filtro-hasta">Hasta</Label>
            <Input
              id="filtro-hasta"
              type="date"
              value={state.to ?? ""}
              onChange={(e) => set({ to: e.target.value || null })}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">Filtrar</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(
              restorationFiltersHref(parseRestorationFilters({}), {
                view: filters.view,
              }),
            )
          }
        >
          Limpiar
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-expanded={showMore}
          aria-controls="filtros-adicionales"
          onClick={() => setShowMore((open) => !open)}
        >
          {showMore ? "Menos filtros" : "Más filtros"}
          {!showMore && hiddenActive > 0 ? ` (${hiddenActive})` : ""}
          <ChevronDown
            aria-hidden
            className={showMore ? "rotate-180" : undefined}
          />
        </Button>
      </div>
    </form>
  );
}
