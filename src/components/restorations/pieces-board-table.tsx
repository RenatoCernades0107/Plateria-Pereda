"use client";

import {
  AlertTriangle,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
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
import { BoardSalePriceCell, BoardServiceCostCell } from "./piece-money-cells";
import { BulkWorkshopButton } from "./bulk-workshop-button";
import {
  isSelectable,
  PiecesBulkBar,
  WORKSHOP_LOCKED,
} from "./pieces-bulk-bar";
import { PiecesExportButtons } from "./pieces-export";
import { usePieceActions, type PieceAction } from "./piece-status-actions";
import { RT } from "./responsive-table";
import {
  LocationBadge,
  PieceStatusBadge,
  StatusAge,
  UrgentBadge,
} from "./status-badges";

/** Días en el taller: columna propia, "—" si la pieza nunca fue al taller. */
function Days({ piece }: { piece: BoardPiece }) {
  if (piece.workshopDays === 0 && !piece.workshopOngoing) {
    return (
      <span className="text-muted-foreground" data-testid="dias-en-taller">
        —
      </span>
    );
  }
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

/**
 * Taller de una fila: el nombre como texto y, para logística y el admin (P55), un
 * botón con lápiz que abre el diálogo para asignarlo o cambiarlo.
 */
function WorkshopCell({
  piece,
  workshops,
  editable,
}: {
  piece: BoardPiece;
  workshops: WorkshopOption[];
  editable: boolean;
}) {
  const current = piece.workshopId ?? NO_WORKSHOP;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const selectId = `taller-${piece.id}`;

  const name = piece.workshopName ? (
    <span>{piece.workshopName}</span>
  ) : (
    <span className="text-muted-foreground">Sin taller</span>
  );
  if (!editable) return name;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const id = value === NO_WORKSHOP ? null : value;
      const result = await assignWorkshop(null, [piece.id], id);
      if ("error" in result) return void toast.error(result.error);
      toast.success(`Taller de ${piece.code} actualizado.`);
      setOpen(false);
    });
  };

  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {name}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setValue(current);
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 print:hidden"
            aria-label={`Cambiar taller de ${piece.code}`}
            title="Cambiar taller"
          >
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Taller de {piece.code}</DialogTitle>
              <DialogDescription>
                Elige el taller que restaurará esta pieza.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={selectId}>Taller</Label>
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id={selectId} className="w-full">
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
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || value === current}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Guardar taller
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Menú discreto (⋯) de una fila con lo que el rol puede hacer con la pieza ahora:
 * los cambios de estado permitidos y llegada, vuelta del taller o devolución. Lo
 * elegido se hace cuando el menú terminó de cerrarse, así el diálogo que abra (nota,
 * taller, confirmación, entrega con saldo) recibe el foco.
 */
function PieceActionsMenu({
  code,
  actions,
}: {
  code: string;
  actions: PieceAction[];
}) {
  const chosen = useRef<(() => void) | null>(null);
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="print:hidden"
          aria-label={`Cambiar estado de ${code}`}
          title="Cambiar estado"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-48"
        onCloseAutoFocus={() => {
          const action = chosen.current;
          chosen.current = null;
          action?.();
        }}
      >
        <DropdownMenuLabel>Cambiar estado</DropdownMenuLabel>
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.key}
            disabled={a.disabled}
            variant={a.destructive ? "destructive" : "default"}
            onSelect={() => {
              chosen.current = a.onSelect;
            }}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Fila de la tabla. El estado se cambia desde aquí con las mismas reglas y diálogos
 * que en el detalle de la pieza (`usePieceActions`); el cambio se ve al instante.
 * Sin datos de pagos de la guía, aprobar la última pieza no ofrece el adelanto (como
 * en el kanban y las acciones masivas); entregar con saldo pendiente sí pide
 * confirmarlo y la BD lo exige igual.
 */
function BoardRow({
  piece,
  role,
  workshops,
  selected,
  onToggle,
  showCost,
  showPrice,
  editingPrices,
  editingCosts,
  assignTaller,
  balanceDue,
}: {
  piece: BoardPiece;
  role: AppRole;
  workshops: WorkshopOption[];
  selected: boolean;
  onToggle: (on: boolean) => void;
  showCost: boolean;
  showPrice: boolean;
  editingPrices: boolean;
  editingCosts: boolean;
  assignTaller: boolean;
  balanceDue: boolean;
}) {
  const {
    piece: live,
    pending,
    actions,
    balanceWarning,
    dialogs,
  } = usePieceActions({
    restorationId: piece.restorationId,
    piece,
    role,
    workshops,
    balanceDue,
  });
  const cell = RT.cell;
  const labeled = cn(RT.cell, RT.labeled);
  const details = [piece.serviceName, materialSummary(piece)]
    .filter((v) => v && v !== "—")
    .join(" · ");

  return (
    <>
      <tr
        className={cn(
          "hover:bg-muted/30 cursor-pointer",
          RT.row,
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
              checked={selected}
              onChange={(e) => onToggle(e.target.checked)}
            />
          ) : null}
        </td>
        <td className={cell}>
          <PiecePhoto code={piece.code} url={piece.photoUrl} size="sm" />
        </td>
        <td className={cn(cell, "max-w-48 max-md:min-w-0 max-md:flex-1")}>
          <Link
            href={pieceHref(piece)}
            data-primary-link
            className="text-heading font-medium whitespace-nowrap underline-offset-4 hover:underline"
          >
            {piece.code}
          </Link>
          <p className="text-muted-foreground text-xs">
            <Link
              href={`/restauraciones/${piece.restorationId}`}
              className="whitespace-nowrap underline-offset-4 hover:underline"
              aria-label={`Ver guía ${piece.restorationCode}`}
            >
              {piece.restorationCode}
            </Link>{" "}
            · {piece.clientName}
          </p>
          {piece.urgent ? (
            <div className="mt-1">
              <UrgentBadge />
            </div>
          ) : null}
        </td>
        <td className={cn(cell, RT.full, "max-w-64 min-w-48")}>
          <p className="break-words">{piece.description}</p>
          {details ? (
            <p className="text-muted-foreground mt-0.5 text-xs break-words">
              {details}
            </p>
          ) : null}
          {piece.lastObservation ? (
            <p className="mt-1 text-xs break-words">
              <span className="text-muted-foreground">
                Última observación:{" "}
              </span>
              {piece.lastObservation}
            </p>
          ) : null}
        </td>
        <td className={labeled} data-label="Estado">
          <div className="flex items-center gap-1">
            <PieceStatusBadge status={live.status} />
            <PieceActionsMenu code={piece.code} actions={actions} />
            {pending ? (
              <Loader2
                className="text-muted-foreground size-4 animate-spin"
                aria-label="Guardando"
              />
            ) : null}
          </div>
          {balanceWarning ? (
            <p className="text-destructive mt-1 text-xs">
              Falta cobrar el saldo
            </p>
          ) : null}
        </td>
        <td className={labeled} data-label="Ubicación">
          <LocationBadge location={live.location} />
        </td>
        <td className={labeled} data-label="En el estado">
          <StatusAge
            // Recién cambiado (optimista): cuenta desde hoy.
            piece={
              live.status === piece.status ? piece : { ...live, statusDays: 0 }
            }
            compact
          />
        </td>
        <td className={labeled} data-label="Taller" data-row-click="ignore">
          <WorkshopCell
            piece={piece}
            workshops={workshops}
            editable={assignTaller && !WORKSHOP_LOCKED.includes(live.status)}
          />
        </td>
        <td className={labeled} data-label="Días en taller">
          <Days piece={piece} />
        </td>
        {showCost ? (
          <td
            className={cn(labeled, "md:text-right")}
            data-label="Costo servicio"
            data-row-click="ignore"
          >
            <BoardServiceCostCell
              piece={piece}
              cents={piece.serviceCostCents}
              editing={editingCosts}
            />
          </td>
        ) : null}
        {showPrice ? (
          <td
            className={cn(labeled, "md:text-right")}
            data-label="Precio venta"
            data-row-click="ignore"
          >
            <BoardSalePriceCell
              piece={piece}
              cents={piece.priceCents}
              hasOrder={piece.hasOrder}
              editing={editingPrices}
            />
          </td>
        ) : null}
      </tr>
      {dialogs}
    </>
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
  balanceDue = [],
}: {
  pieces: BoardPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
  /** Restauraciones a las que les falta cobrar el saldo para entregar (P45). */
  balanceDue?: string[];
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
  const [editingCosts, setEditingCosts] = useState(false);

  if (pieces.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        No hay piezas con esos filtros.
      </p>
    );
  }

  const head = "px-3 py-2 text-left font-medium whitespace-nowrap";

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={null}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
        workshopPicker={false}
      >
        <PiecesExportButtons pieces={chosen} showPrice={showPrice} />
      </PiecesBulkBar>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {showPrice && editPrice ? (
          <Button
            size="sm"
            variant={editingPrices ? "default" : "outline"}
            aria-pressed={editingPrices}
            onClick={() => setEditingPrices((on) => !on)}
          >
            {editingPrices ? <Check /> : <Pencil />}
            Editar precio de venta
          </Button>
        ) : null}
        {showCost ? (
          <Button
            size="sm"
            variant={editingCosts ? "default" : "outline"}
            aria-pressed={editingCosts}
            onClick={() => setEditingCosts((on) => !on)}
          >
            {editingCosts ? <Check /> : <Pencil />}
            Editar costo de servicio
          </Button>
        ) : null}
        {assignTaller ? (
          <BulkWorkshopButton
            chosen={chosen}
            workshops={workshops}
            onDone={() => setSelected([])}
          />
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
      <div className={RT.wrapper}>
        <table className={cn(RT.table, "md:min-w-max")}>
          <caption className="sr-only">Piezas en curso</caption>
          <thead className={RT.thead}>
            <tr>
              <th scope="col" className={cn(head, "w-8")}>
                <span className="sr-only">Elegir</span>
              </th>
              <th scope="col" className={head}>
                Foto
              </th>
              <th scope="col" className={head}>
                Pieza · guía · cliente
              </th>
              <th scope="col" className={head}>
                Descripción
              </th>
              <th scope="col" className={head}>
                Estado
              </th>
              <th scope="col" className={head}>
                Ubicación
              </th>
              <th scope="col" className={head}>
                En el estado
              </th>
              <th scope="col" className={head}>
                Taller
              </th>
              <th scope="col" className={head}>
                Días en taller
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
            </tr>
          </thead>
          <tbody className={RT.tbody}>
            {pieces.map((piece) => (
              <BoardRow
                key={piece.id}
                piece={piece}
                role={role}
                workshops={workshops}
                selected={selected.includes(piece.id)}
                onToggle={(on) => toggle(piece.id, on)}
                showCost={showCost}
                showPrice={showPrice}
                editingPrices={editPrice && editingPrices}
                editingCosts={showCost && editingCosts}
                assignTaller={assignTaller}
                balanceDue={balanceDue.includes(piece.restorationId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
