"use client";

import {
  ArrowDown,
  ArrowUp,
  Hammer,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { DRAG_SCROLL_CLASS, useDragScroll } from "@/components/use-drag-scroll";
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
  type PieceBoardFilters,
  pieceBoardHref,
  type PieceBoardSort,
  pieceSortChange,
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
  isWorkshopLocked,
  PiecesBulkBar,
} from "./pieces-bulk-bar";
import { ProviderReportButton } from "./provider-report-button";
import { usePieceActions, type PieceAction } from "./piece-status-actions";
import { RT } from "./responsive-table";
import {
  isPieceInReview,
  ReviewBadge,
  LocationBadge,
  PieceStatusBadge,
  StatusAge,
  PieceQuantity,
  UrgentIcon,
} from "./status-badges";
import { DeliveryDate } from "./urgent-toggle";
import { WorkshopEditButton } from "./workshop-edit-button";

/**
 * Total de días en el taller (todas las idas, P47), distinto del tiempo en el estado
 * actual: lleva el martillo y no el triángulo de alerta del semáforo, y solo se pone en
 * rojo cuando la pieza sigue en el taller desde hace muchos días (la misma regla que
 * resalta la fila). "—" si la pieza nunca fue al taller.
 */
function Days({ piece }: { piece: BoardPiece }) {
  // Nunca fue al taller: nada debajo del nombre.
  if (piece.workshopDays === 0 && !piece.workshopOngoing) return null;
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
      title={`Días en el taller, sumando todas las idas. Rojo si sigue allí desde hace ${WORKSHOP_DAYS_ALERT} días o más.`}
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
 * Taller de una fila: el nombre como texto y, debajo, el total de días en el taller.
 * Solo si la pieza aún no tiene taller, logística y el admin (P55) ven el lápiz para
 * asignarlo; un taller ya asignado se cambia desde el detalle de la pieza.
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
  const name =
    piece.workshopId || !editable ? (
      piece.workshopName ? (
        <span>{piece.workshopName}</span>
      ) : (
        <span className="text-muted-foreground">Sin taller</span>
      )
    ) : (
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span className="text-muted-foreground">Sin taller</span>
        <WorkshopEditButton piece={piece} workshops={workshops} />
      </div>
    );
  return (
    <div className="flex flex-col items-start gap-0.5">
      {name}
      <Days piece={piece} />
    </div>
  );
}

/** Días en la ubicación actual, debajo de su insignia ("Hoy", "1 día", "N días"). */
function LocationDays({ days }: { days: number | null }) {
  if (days === null) return null;
  return (
    <span
      className="text-muted-foreground text-xs whitespace-nowrap"
      data-testid="dias-en-ubicacion"
    >
      {days === 0 ? "Hoy" : `${days} ${days === 1 ? "día" : "días"}`}
    </span>
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
// Casilla, foto y código quedan fijos al desplazarse de lado: anchos fijos (con el
// `px-3` de las celdas) para calcular dónde empieza cada una.
const STICKY = {
  check: cn(RT.sticky, "md:left-0 md:w-10 md:min-w-10"),
  photo: cn(RT.sticky, "md:left-10 md:w-[4.25rem] md:min-w-[4.25rem]"),
  code: cn(RT.sticky, RT.stickyEdge, "md:left-[6.75rem]"),
};

function BoardRow({
  piece,
  role,
  workshops,
  selected,
  onToggle,
  showCost,
  showPrice,
  showClient,
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
  /** Logística no ve clientes. */
  showClient: boolean;
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
          "cursor-pointer",
          RT.hoverRow,
          RT.row,
          isLongInWorkshop(piece) && RT.alertRow,
        )}
        data-testid={`pieza-${piece.code}`}
        onClick={navigateRow}
      >
        <td className={cn(cell, STICKY.check)}>
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
        <td className={cn(cell, STICKY.photo)}>
          <PiecePhoto code={piece.code} url={piece.photoUrl} size="sm" />
        </td>
        <td className={cn(cell, STICKY.code, "max-md:min-w-0 max-md:flex-1")}>
          {/* Urgente: solo el rayo, al costado del código; y la cantidad,
              siempre. El código ya dice la guía (el detalle de la pieza la enlaza). */}
          <span className="inline-flex items-center gap-1">
            <Link
              href={pieceHref(piece)}
              data-primary-link
              className="text-heading font-medium whitespace-nowrap underline-offset-4 hover:underline"
              title={`Guía ${piece.restorationCode}`}
            >
              {piece.code}
            </Link>
            <PieceQuantity quantity={piece.quantity} />
            {piece.urgent ? <UrgentIcon /> : null}
          </span>
          {piece.urgent ? (
            <DeliveryDate piece={piece} className="mt-0.5 flex" />
          ) : null}
        </td>
        {showClient ? (
          <td className={cn(labeled, "max-w-40")} data-label="Cliente">
            <span className="break-words">{piece.clientName}</span>
          </td>
        ) : null}
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
          <div className="flex items-start gap-1">
            <PieceStatusBadge status={live.status} wrap />
            <PieceActionsMenu code={piece.code} actions={actions} />
            {pending ? (
              <Loader2
                className="text-muted-foreground size-4 animate-spin"
                aria-label="Guardando"
              />
            ) : null}
          </div>
          <StatusAge
            // Recién cambiado (optimista): cuenta desde hoy.
            piece={
              live.status === piece.status ? piece : { ...live, statusDays: 0 }
            }
            compact
            className="mt-1"
          />
          {balanceWarning ? (
            <p className="text-destructive mt-1 text-xs">
              Falta cobrar el saldo
            </p>
          ) : null}
        </td>
        <td className={labeled} data-label="Ubicación">
          <div className="flex flex-col items-start gap-1">
            <LocationBadge location={live.location} />
            {isPieceInReview(live) ? <ReviewBadge /> : null}
            {/* Recién movida (optimista): cuenta desde hoy. */}
            <LocationDays
              days={live.location === piece.location ? piece.locationDays : 0}
            />
          </div>
        </td>
        <td className={labeled} data-label="Taller" data-row-click="ignore">
          <WorkshopCell
            piece={piece}
            workshops={workshops}
            editable={assignTaller && !isWorkshopLocked(live)}
          />
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
              quantity={piece.quantity}
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
              quantity={piece.quantity}
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
 * costo de servicio y el precio de venta (D58; logística desde el 2026-10-19). Ventas
 * ve el precio. Nadie ve aquí totales ni márgenes. El lápiz solo sale donde falta el dato
 * (sin taller, costo o precio por definir); lo ya puesto se cambia desde el detalle
 * de la pieza. Selección para acciones en bloque; las urgentes van primero y se
 * resaltan las que llevan muchos días en el taller.
 */
/** Orden de la columna para `aria-sort` (solo la activa). */
function ariaSort(
  filters: PieceBoardFilters | undefined,
  sort: PieceBoardSort,
) {
  if (!filters || filters.sort !== sort) return undefined;
  return filters.dir === "asc" ? "ascending" : "descending";
}

/**
 * Encabezado que ordena la vista: la misma columna invierte el sentido. El nombre de
 * la columna sigue siendo su texto; "Ordenar por…" va en el `title`.
 */
function SortHeader({
  filters,
  sort,
  label,
  children,
}: {
  filters: PieceBoardFilters | undefined;
  sort: PieceBoardSort;
  label: string;
  children: React.ReactNode;
}) {
  if (!filters) return <>{children}</>;
  const active = filters.sort === sort;
  const Icon = filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={pieceBoardHref(filters, pieceSortChange(filters, sort))}
      className="inline-flex items-center gap-1 hover:underline"
      title={`Ordenar por ${label}`}
    >
      {children}
      {active ? <Icon className="size-3.5" aria-hidden /> : null}
    </Link>
  );
}

export function PiecesBoardTable({
  pieces,
  role,
  workshops,
  balanceDue = [],
  filters,
}: {
  pieces: BoardPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
  /** Restauraciones a las que les falta cobrar el saldo para entregar (P45). */
  balanceDue?: string[];
  /** Filtros de la vista: con ellos, los encabezados ordenan. */
  filters?: PieceBoardFilters;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = pieces.filter((p) => selected.includes(p.id));
  const selectable = pieces.filter((p) => isSelectable(p, role));
  const allChosen =
    selectable.length > 0 && selectable.every((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const showCost = can(role, "piezas.costo-servicio");
  const showPrice = can(role, "piezas.precio-venta.ver");
  const showClient = can(role, "clientes.ver");
  const editPrice = can(role, "piezas.precio-venta");
  const assignTaller = can(role, "piezas.asignar-taller");

  const dragScroll = useDragScroll<HTMLDivElement>();
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
        total={selectable.length}
        workshopPicker={false}
      >
        <ProviderReportButton
          pieces={chosen}
          showServiceCost={can(role, "piezas.costo-servicio")}
        />
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
      <div ref={dragScroll} className={cn(RT.wrapper, DRAG_SCROLL_CLASS)}>
        <table className={cn(RT.table, "md:min-w-max")}>
          <caption className="sr-only">Piezas en curso</caption>
          <thead className={RT.thead}>
            <tr>
              <th scope="col" className={cn(head, STICKY.check)}>
                <span className="sr-only">Elegir</span>
              </th>
              <th scope="col" className={cn(head, STICKY.photo)}>
                Foto
              </th>
              <th
                scope="col"
                className={cn(head, STICKY.code)}
                aria-sort={ariaSort(filters, "guia")}
              >
                <SortHeader filters={filters} sort="guia" label="guía">
                  Pieza
                </SortHeader>
              </th>
              {showClient ? (
                <th scope="col" className={head}>
                  Cliente
                </th>
              ) : null}
              <th scope="col" className={head}>
                Descripción
              </th>
              <th
                scope="col"
                className={cn(head, "w-48")}
                title="Debajo, los días desde el último cambio de estado: ámbar o rojo según lo que se espera para ese estado."
              >
                Estado
              </th>
              <th
                scope="col"
                className={head}
                title="Debajo, los días que lleva en esa ubicación."
              >
                Ubicación
              </th>
              <th
                scope="col"
                className={head}
                title={`Debajo, los días acumulados en el taller, sumando todas las idas. Rojo si sigue allí desde hace ${WORKSHOP_DAYS_ALERT} días o más.`}
                aria-sort={ariaSort(filters, "dias_taller")}
              >
                <SortHeader
                  filters={filters}
                  sort="dias_taller"
                  label="días en taller"
                >
                  Taller
                </SortHeader>
              </th>
              {showCost ? (
                <th scope="col" className={cn(head, "text-right")}>
                  Costo servicio
                </th>
              ) : null}
              {showPrice ? (
                <th
                  scope="col"
                  className={cn(head, "text-right")}
                  aria-sort={ariaSort(filters, "precio")}
                >
                  <SortHeader
                    filters={filters}
                    sort="precio"
                    label="precio de venta"
                  >
                    Precio venta
                  </SortHeader>
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
                showClient={showClient}
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
