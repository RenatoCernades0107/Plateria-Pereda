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
  BOARD_LOCATIONS,
  BOARD_STATUSES,
  pieceBoardHref,
  type PieceBoardFilters,
} from "@/domain/piece-board-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import { PIECE_LOCATION_LABELS } from "@/domain/restoration-status";

const ALL = "todos";

/** Filtros de la vista de piezas (se guardan en la URL). */
export function PiecesBoardFiltersForm({
  filters,
  workshops,
}: {
  filters: PieceBoardFilters;
  workshops: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, setState] = useState(filters);
  const set = (patch: Partial<PieceBoardFilters>) =>
    setState((s) => ({ ...s, ...patch }));

  return (
    <form
      aria-label="Filtros de piezas"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(pieceBoardHref(state, { page: 1 }));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="filtro-texto">Código, descripción o cliente</Label>
        <Input
          id="filtro-texto"
          type="search"
          value={state.q}
          maxLength={100}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-ubicacion">Ubicación</Label>
        <Select
          value={state.location ?? ALL}
          onValueChange={(v) =>
            set({
              location: v === ALL ? null : (v as PieceBoardFilters["location"]),
            })
          }
        >
          <SelectTrigger id="filtro-ubicacion" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {BOARD_LOCATIONS.map((l) => (
              <SelectItem key={l} value={l}>
                {PIECE_LOCATION_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select
          value={state.status ?? ALL}
          onValueChange={(v) =>
            set({
              status: v === ALL ? null : (v as PieceBoardFilters["status"]),
            })
          }
        >
          <SelectTrigger id="filtro-estado" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {BOARD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PIECE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-taller">Taller</Label>
        <Select
          value={state.workshopId ?? ALL}
          onValueChange={(v) => set({ workshopId: v === ALL ? null : v })}
        >
          <SelectTrigger id="filtro-taller" className="w-full">
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
        <Label htmlFor="filtro-dias">Días en taller (mín.)</Label>
        <Input
          id="filtro-dias"
          type="number"
          min={1}
          max={365}
          inputMode="numeric"
          value={state.minDays ?? ""}
          onChange={(e) => {
            const value = Number.parseInt(e.target.value, 10);
            set({
              minDays: Number.isFinite(value) && value > 0 ? value : null,
            });
          }}
        />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/piezas")}
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
