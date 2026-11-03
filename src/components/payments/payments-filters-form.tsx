"use client";

import { FilterFormActions } from "@/components/filter-form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { useLiveFilters } from "@/components/use-live-filters";
import {
  parsePaymentListFilters,
  paymentListHref,
  type PaymentListFilters,
} from "@/domain/payment-list-filters";
import { PAYMENT_KIND_LABELS, PAYMENT_KINDS } from "@/domain/payments";

/**
 * Búsqueda y filtros de la vista de pagos (en la URL): se aplican solos, el texto al
 * dejar de escribir y lo demás al elegirlo.
 */
export function PaymentsFiltersForm({
  filters,
  methods,
  branches,
}: {
  filters: PaymentListFilters;
  /** Métodos usados en algún pago. */
  methods: string[];
  branches: { id: string; name: string }[];
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => paymentListHref(f, { page: 1 }),
  );
  const set = (patch: Partial<PaymentListFilters>) => update(patch);
  // Un método filtrado que ya no está en la lista (p. ej. de un enlace) sigue visible.
  const methodOptions = [...new Set([...methods, ...filters.methods])].map(
    (m) => ({ value: m, label: m }),
  );

  return (
    <form aria-label="Filtros de pagos" className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <Label htmlFor="pagos-texto">Restauración, cliente o pedido</Label>
          <Input
            id="pagos-texto"
            type="search"
            value={state.q}
            maxLength={100}
            placeholder="Escribe para buscar"
            onChange={(e) => update({ q: e.target.value }, { debounce: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pagos-tipo">Tipo</Label>
          <MultiSelect
            id="pagos-tipo"
            options={PAYMENT_KINDS.map((k) => ({
              value: k,
              label: PAYMENT_KIND_LABELS[k],
            }))}
            value={state.kind}
            onChange={(kind) => set({ kind })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pagos-metodo">Método</Label>
          <MultiSelect
            id="pagos-metodo"
            options={methodOptions}
            value={state.methods}
            onChange={(methods) => set({ methods })}
          />
        </div>
        {branches.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="pagos-sucursal">Sucursal</Label>
            <MultiSelect
              id="pagos-sucursal"
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              value={state.branchIds}
              onChange={(branchIds) => set({ branchIds })}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <div className="space-y-1.5">
            <Label htmlFor="pagos-desde">Desde</Label>
            <Input
              id="pagos-desde"
              type="date"
              value={state.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pagos-hasta">Hasta</Label>
            <Input
              id="pagos-hasta"
              type="date"
              value={state.to ?? ""}
              onChange={(e) => set({ to: e.target.value || null })}
            />
          </div>
        </div>
      </div>
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parsePaymentListFilters({}))}
      />
    </form>
  );
}
