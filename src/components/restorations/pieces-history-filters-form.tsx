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
import {
  HISTORY_STATUSES,
  parsePieceHistoryFilters,
  pieceHistoryHref,
  type PieceHistoryFilters,
} from "@/domain/piece-history-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";

const ALL = "todos";

/** Filtros del historial de piezas (se guardan en la URL). */
export function PiecesHistoryFiltersForm({
  filters,
  workshops,
}: {
  filters: PieceHistoryFilters;
  workshops: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, setState] = useState(filters);
  const set = (patch: Partial<PieceHistoryFilters>) =>
    setState((s) => ({ ...s, ...patch }));

  return (
    <form
      aria-label="Filtros del historial"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_repeat(4,minmax(0,1fr))_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(pieceHistoryHref(state, { page: 1 }));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="historial-texto">Código, descripción o cliente</Label>
        <Input
          id="historial-texto"
          type="search"
          value={state.q}
          maxLength={100}
          onChange={(e) => set({ q: e.target.value })}
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
          onChange={(e) => set({ guide: e.target.value })}
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
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(pieceHistoryHref(parsePieceHistoryFilters({})))
          }
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
