"use client";

import { AlertTriangle, Check, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { navigateRow } from "@/components/clickable-row";
import { isLongInWorkshop } from "@/domain/piece-board-filters";
import { can } from "@/domain/permissions";
import { pieceHref } from "@/domain/restoration-pieces-view";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "@/server/restorations/queries";
import { assignWorkshop } from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import { materialSummary, PiecePhoto } from "./piece-photo";
import { BoardSalePriceCell, ServiceCostInput } from "./piece-money-cells";
import {
  isSelectable,
  PiecesBulkBar,
  WORKSHOP_LOCKED,
} from "./pieces-bulk-bar";
import { PiecesExportButtons } from "./pieces-export";
import {
  LocationBadge,
  PieceStatusBadge,
  StatusAge,
  UrgentBadge,
} from "./status-badges";

function Days({ piece }: { piece: BoardPiece }) {
  const long = isLongInWorkshop(piece);
  const label = `${piece.workshopDays} ${piece.workshopDays === 1 ? "día" : "días"}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        long && "text-destructive font-medium",
      )}
      data-testid="dias-en-taller"
    >
      {long ? (
        <AlertTriangle
          className="size-4"
          aria-label="Muchos días en el taller"
        />
      ) : null}
      {piece.workshopOngoing ? `${label} (en curso)` : label}
    </span>
  );
}

const NO_WORKSHOP = "ninguno";

/** Taller de una fila: logística y el admin lo asignan aquí mismo (P55). */
function WorkshopSelect({
  piece,
  workshops,
}: {
  piece: BoardPiece;
  workshops: WorkshopOption[];
}) {
  const [pending, startTransition] = useTransition();
  const change = (value: string) =>
    startTransition(async () => {
      const id = value === NO_WORKSHOP ? null : value;
      const result = await assignWorkshop(null, [piece.id], id);
      if ("error" in result) toast.error(result.error);
      else toast.success(`Taller de ${piece.code} actualizado.`);
    });
  return (
    <Select
      value={piece.workshopId ?? NO_WORKSHOP}
      onValueChange={change}
      disabled={pending}
    >
      <SelectTrigger
        size="sm"
        className="w-40"
        aria-label={`Taller de ${piece.code}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_WORKSHOP}>Sin taller</SelectItem>
        {workshops.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            {w.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Vista de piezas en tabla, como una hoja de cálculo (12.2, P55): primero la foto
 * "Antes" de cada pieza y sus datos principales; logística y el admin ingresan el
 * costo de servicio y, viéndolo, el admin pone el precio de venta (D58). Ventas ve el
 * precio y logística no ve montos de venta. Selección para acciones en bloque; las
 * urgentes van primero y se resaltan las que llevan muchos días en el taller.
 */
export function PiecesBoardTable({
  pieces,
  role,
  workshops,
}: {
  pieces: BoardPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = pieces.filter((p) => selected.includes(p.id));
  const selectable = pieces.filter((p) => isSelectable(p, role));
  const allChosen =
    selectable.length > 0 && selectable.every((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const showCost = can(role, "piezas.costo-servicio");
  const showPrice = can(role, "dinero.ver");
  const editPrice = can(role, "piezas.precio-venta");
  const assignTaller = can(role, "piezas.asignar-taller");
  const [editingPrices, setEditingPrices] = useState(false);

  if (pieces.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        No hay piezas con esos filtros.
      </p>
    );
  }

  const head = "px-3 py-2 text-left font-medium whitespace-nowrap";
  const cell = "px-3 py-2 align-top";

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={null}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
      >
        <PiecesExportButtons pieces={chosen} showPrice={showPrice} />
      </PiecesBulkBar>
      <div className="flex flex-wrap items-center gap-4">
        {showPrice && editPrice ? (
          <Button
            size="sm"
            variant={editingPrices ? "default" : "outline"}
            aria-pressed={editingPrices}
            onClick={() => setEditingPrices((on) => !on)}
          >
            {editingPrices ? <Check /> : <Pencil />}
            {editingPrices ? "Terminar edición" : "Editar precios"}
          </Button>
        ) : null}
        {selectable.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={allChosen}
              onChange={(e) =>
                setSelected(e.target.checked ? selectable.map((p) => p.id) : [])
              }
            />
            Elegir todas las de esta página
          </label>
        ) : null}
      </div>
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">Piezas en curso</caption>
          <thead className="bg-muted/60 text-muted-foreground border-b text-xs">
            <tr>
              <th scope="col" className={cn(head, "w-8")}>
                <span className="sr-only">Elegir</span>
              </th>
              <th scope="col" className={head}>
                Foto antes
              </th>
              <th scope="col" className={head}>
                Pieza
              </th>
              <th scope="col" className={head}>
                Guía · cliente
              </th>
              <th scope="col" className={head}>
                Descripción
              </th>
              <th scope="col" className={head}>
                Servicio
              </th>
              {showCost ? (
                <th scope="col" className={cn(head, "text-right")}>
                  Costo servicio
                </th>
              ) : null}
              {showPrice ? (
                <th scope="col" className={cn(head, "text-right")}>
                  Precio venta
                </th>
              ) : null}
              <th scope="col" className={head}>
                Material · medida · peso
              </th>
              <th scope="col" className={head}>
                Estado
              </th>
              <th scope="col" className={head}>
                Taller · días
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pieces.map((piece) => (
              <tr
                key={piece.id}
                className={cn(
                  "hover:bg-muted/30 cursor-pointer",
                  isLongInWorkshop(piece) && "bg-destructive/5",
                )}
                data-testid={`pieza-${piece.code}`}
                onClick={navigateRow}
              >
                <td className={cell}>
                  {isSelectable(piece, role) ? (
                    <input
                      type="checkbox"
                      className="accent-primary mt-1 size-4"
                      aria-label={`Elegir ${piece.code}`}
                      checked={selected.includes(piece.id)}
                      onChange={(e) => toggle(piece.id, e.target.checked)}
                    />
                  ) : null}
                </td>
                <td className={cell}>
                  <PiecePhoto code={piece.code} url={piece.photoUrl} />
                </td>
                <td className={cn(cell, "whitespace-nowrap")}>
                  <Link
                    href={pieceHref(piece)}
                    data-primary-link
                    className="text-heading font-medium underline-offset-4 hover:underline"
                  >
                    {piece.code}
                  </Link>
                  {piece.urgent ? (
                    <div className="mt-1">
                      <UrgentBadge />
                    </div>
                  ) : null}
                </td>
                <td className={cn(cell, "max-w-44")}>
                  <Link
                    href={`/restauraciones/${piece.restorationId}`}
                    className="whitespace-nowrap underline-offset-4 hover:underline"
                    aria-label={`Ver guía ${piece.restorationCode}`}
                  >
                    {piece.restorationCode}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {piece.clientName}
                  </p>
                </td>
                <td className={cn(cell, "max-w-60 min-w-44")}>
                  <p className="break-words">{piece.description}</p>
                  {piece.lastObservation ? (
                    <p className="mt-1 text-xs break-words">
                      <span className="text-muted-foreground">
                        Última observación:{" "}
                      </span>
                      {piece.lastObservation}
                    </p>
                  ) : null}
                </td>
                <td className={cn(cell, "max-w-36")}>
                  {piece.serviceName || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {showCost ? (
                  <td
                    className={cn(cell, "text-right")}
                    data-row-click="ignore"
                  >
                    <ServiceCostInput
                      piece={piece}
                      cents={piece.serviceCostCents}
                    />
                  </td>
                ) : null}
                {showPrice ? (
                  <td
                    className={cn(cell, "text-right")}
                    data-row-click="ignore"
                  >
                    <BoardSalePriceCell
                      piece={piece}
                      cents={piece.priceCents}
                      hasOrder={piece.hasOrder}
                      editing={editPrice && editingPrices}
                    />
                  </td>
                ) : null}
                <td className={cn(cell, "text-muted-foreground max-w-40")}>
                  {materialSummary(piece)}
                </td>
                <td className={cell}>
                  <div className="flex flex-col items-start gap-1">
                    <PieceStatusBadge status={piece.status} />
                    <LocationBadge location={piece.location} />
                    <StatusAge piece={piece} />
                  </div>
                </td>
                <td className={cell}>
                  {assignTaller && !WORKSHOP_LOCKED.includes(piece.status) ? (
                    <div className="mb-1">
                      <WorkshopSelect piece={piece} workshops={workshops} />
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      {piece.workshopName ?? "Sin taller"}
                    </p>
                  )}
                  <Days piece={piece} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
