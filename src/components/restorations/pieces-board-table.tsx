"use client";

import { Hammer, Loader2, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { navigateRow } from "@/components/clickable-row";
import {
  isLongInWorkshop,
  WORKSHOP_DAYS_ALERT,
} from "@/domain/piece-board-filters";
import { can } from "@/domain/permissions";
import { pieceHref } from "@/domain/restoration-pieces-view";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "@/server/restorations/queries";

import type { WorkshopOption } from "./piece-fields";
import { materialSummary, PiecePhoto } from "./piece-photo";
import { BoardSalePriceCell, BoardServiceCostCell } from "./piece-money-cells";
import {
  isSelectable,
  PiecesBulkBar,
  WORKSHOP_LOCKED,
} from "./pieces-bulk-bar";
import { ProviderReportButton } from "./provider-report-button";
import { usePieceActions, type PieceAction } from "./piece-status-actions";
import { RT } from "./responsive-table";
import {
  LocationBadge,
  PieceStatusBadge,
  StatusAge,
  UrgentIcon,
} from "./status-badges";
import { WorkshopEditButton } from "./workshop-edit-button";

/**
 * Total de días en el taller (todas las idas, P47), distinto del tiempo en el estado
 * actual: lleva el martillo y no el triángulo de alerta del semáforo, y solo se pone en
 * rojo cuando la pieza sigue en el taller desde hace muchos días (la misma regla que
 * resalta la fila). "—" si la pieza nunca fue al taller.
 */
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
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        long ? "text-destructive font-medium" : "text-foreground",
      )}
      data-testid="dias-en-taller"
      data-long={long || undefined}
    >
      {long ? (
        <Hammer
          className="size-3.5"
          role="img"
          aria-label="Muchos días en el taller"
        />
      ) : (
        <Hammer className="size-3.5 opacity-60" aria-hidden />
      )}
      {piece.workshopOngoing ? `${label} (en curso)` : label}
    </span>
  );
}

/**
 * Taller de una fila: el nombre como texto. Solo si la pieza aún no tiene taller,
 * logística y el admin (P55) ven el lápiz para asignarlo; un taller ya asignado se
 * cambia desde el detalle de la pieza.
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
  if (piece.workshopId || !editable) {
    return piece.workshopName ? (
      <span>{piece.workshopName}</span>
    ) : (
      <span className="text-muted-foreground">Sin taller</span>
    );
  }
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">Sin taller</span>
      <WorkshopEditButton piece={piece} workshops={workshops} />
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
          // En pantallas táctiles, del tamaño de un dedo (≥ 40 px).
          className="print:hidden pointer-coarse:size-10"
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
  editPrice,
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
  editPrice: boolean;
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
        <td className={cn(cell, "max-md:min-w-0 max-md:flex-1")}>
          {/* Urgente: solo el rayo, al costado del código. */}
          <span className="inline-flex items-center gap-1">
            <Link
              href={pieceHref(piece)}
              data-primary-link
              className="text-heading font-medium whitespace-nowrap underline-offset-4 hover:underline"
            >
              {piece.code}
            </Link>
            {piece.urgent ? <UrgentIcon /> : null}
          </span>
        </td>
        <td className={labeled} data-label="Guía">
          <Link
            href={`/restauraciones/${piece.restorationId}`}
            className="text-muted-foreground hover:text-foreground whitespace-nowrap underline-offset-4 hover:underline"
            aria-label={`Ver guía ${piece.restorationCode}`}
          >
            {piece.restorationCode}
          </Link>
        </td>
        <td className={cn(labeled, "max-w-40")} data-label="Cliente">
          <span className="break-words">{piece.clientName}</span>
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
        <td className={labeled} data-label="En este estado">
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
        <td className={labeled} data-label="Total en taller">
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
              editable={editPrice}
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
 * precio y logística no ve montos de venta. El lápiz solo sale donde falta el dato
 * (sin taller, costo o precio por definir); lo ya puesto se cambia desde el detalle
 * de la pieza. Selección para acciones en bloque; las urgentes van primero y se
 * resaltan las que llevan muchos días en el taller.
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

  if (pieces.length === 0) {
    return <EmptyState title="No hay piezas en curso." />;
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
        <ProviderReportButton pieces={chosen} />
      </PiecesBulkBar>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                Pieza
              </th>
              <th scope="col" className={head}>
                Guía
              </th>
              <th scope="col" className={head}>
                Cliente
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
              <th
                scope="col"
                className={head}
                title="Días desde el último cambio de estado. Ámbar o rojo según lo que se espera para ese estado."
              >
                En este estado
              </th>
              <th scope="col" className={head}>
                Taller
              </th>
              <th
                scope="col"
                className={head}
                title={`Días acumulados en el taller, sumando todas las idas. Rojo si sigue allí desde hace ${WORKSHOP_DAYS_ALERT} días o más.`}
              >
                Total en taller
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
                editPrice={editPrice}
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
