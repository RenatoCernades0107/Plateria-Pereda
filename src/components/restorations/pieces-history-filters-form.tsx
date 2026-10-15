"use client";

import { FilterFormActions } from "@/components/filter-form-actions";
import { useLiveFilters } from "@/components/use-live-filters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HISTORY_STATUSES,
  parsePieceHistoryFilters,
  pieceHistoryHref,
  type PieceHistoryFilters,
} from "@/domain/piece-history-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";

const ALL = "todos";

/** Filtros del historial de piezas (se guardan en la URL y se aplican solos). */
export function PiecesHistoryFiltersForm({
  filters,
  workshops,
  showClient = true,
}: {
  filters: PieceHistoryFilters;
  workshops: { id: string; name: string }[];
  /** Logística no ve clientes: la búsqueda no los menciona. */
  showClient?: boolean;
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => pieceHistoryHref(f, { page: 1 }),
  );
  const set = (patch: Partial<PieceHistoryFilters>) => update(patch);
  const type = (patch: Partial<PieceHistoryFilters>) =>
    update(patch, { debounce: true });

  return (
    <form
      aria-label="Filtros del historial"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_repeat(4,minmax(0,1fr))_auto]"
      onSubmit={submit}
    >
      <div className="space-y-1.5">
        <Label htmlFor="historial-texto">
          {showClient
            ? "Código, descripción o cliente"
            : "Código o descripción"}
        </Label>
        <Input
          id="historial-texto"
          type="search"
          value={state.q}
          maxLength={100}
          placeholder="Escribe para buscar"
          onChange={(e) => type({ q: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-guia">N.º de guía</Label>
        <Input
          id="historial-guia"
          type="search"
          inputMode="numeric"
          placeholder="RES-00123"
          value={state.guide}
          maxLength={20}
          onChange={(e) => type({ guide: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-estado">Estado</Label>
        <Select
          value={state.status ?? ALL}
          onValueChange={(v) =>
            set({
              status: v === ALL ? null : (v as PieceHistoryFilters["status"]),
            })
          }
        >
          <SelectTrigger id="historial-estado" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {HISTORY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PIECE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-taller">Taller</Label>
        <Select
          value={state.workshopId ?? ALL}
          onValueChange={(v) => set({ workshopId: v === ALL ? null : v })}
        >
          <SelectTrigger id="historial-taller" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {workshops.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-desde">Entregada desde</Label>
        <Input
          id="historial-desde"
          type="date"
          value={state.from ?? ""}
          max={state.to ?? undefined}
          onChange={(e) => set({ from: e.target.value || null })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-hasta">Entregada hasta</Label>
        <Input
          id="historial-hasta"
          type="date"
          value={state.to ?? ""}
          min={state.from ?? undefined}
          onChange={(e) => set({ to: e.target.value || null })}
        />
      </div>
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parsePieceHistoryFilters({}))}
      />
    </form>
  );
}
