"use client";

import { ChevronDown, ChevronRight, Loader2, Pencil, Tag } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import type { ApprovalPayment } from "@/components/payments/piece-payment-dialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCents } from "@/domain/money";
import { can } from "@/domain/permissions";
import type { PieceEditableField } from "@/domain/restoration-edit";
import { pieceAnchor, pieceHref } from "@/domain/restoration-pieces-view";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { PieceDetail } from "@/server/restorations/queries";

import { PieceDialog } from "./edit-dialogs";
import type { CatalogOption, WorkshopOption } from "./piece-fields";
import { SalePriceInput } from "./piece-money-cells";
import { materialSummary, PiecePhoto } from "./piece-photo";
import { usePieceActions } from "./piece-status-actions";
import { PriceChangeDialog } from "./price-change-dialog";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import { LocationBadge, PieceStatusBadge, UrgentBadge } from "./status-badges";

export { commonTransitions } from "./pieces-bulk-bar";

export type PieceEditing = {
  editable: Record<string, readonly PieceEditableField[]>;
  priceHint: string;
  /** Piezas cuyo precio cambia el admin con motivo (orden de Shopify creada, 9.2). */
  priceChange?: Record<string, boolean>;
  materials: CatalogOption[];
  services: CatalogOption[];
};

const PRE_APPROVAL: readonly PieceDetail["status"][] = [
  "registrada",
  "en_consulta",
  "en_espera",
];

const HEAD = "px-2 py-2 text-left font-medium whitespace-nowrap";
const CELL = "px-2 py-2 align-top";

type RowProps = {
  restorationId: string;
  piece: PieceDetail;
  role: AppRole;
  workshops: WorkshopOption[];
  editing: PieceEditing | null;
  photoUrl: string | null;
  approvalPayment: ApprovalPayment | null;
  balanceDue: boolean;
  /** Casilla para elegirla (null si la pieza no admite acciones). */
  checkbox: React.ReactNode;
};

/** Una fila de la tabla: datos de la pieza y su menú «Acciones». */
function PieceRow({
  restorationId,
  piece,
  role,
  workshops,
  editing,
  photoUrl,
  approvalPayment,
  balanceDue,
  checkbox,
}: RowProps) {
  const {
    piece: live,
    pending,
    actions,
    balanceWarning,
    dialogs,
  } = usePieceActions({
    restorationId,
    piece,
    role,
    workshops,
    approvalPayment,
    balanceDue,
  });
  const [open, setOpen] = useState<"editar" | "precio" | null>(null);
  // Lo elegido en el menú se hace cuando el menú terminó de cerrarse (y devolvió el
  // foco a su botón): así el diálogo que se abre recibe el foco y lo devuelve al cerrar.
  const chosen = useRef<(() => void) | null>(null);

  const editable = editing?.editable[piece.id] ?? [];
  const canEdit = editing !== null && editable.length > 0;
  const priceChange = Boolean(editing?.priceChange?.[piece.id]);
  const showPrice = can(role, "dinero.ver");
  const editPrice =
    can(role, "piezas.precio-venta") &&
    (editable.includes("price") || priceChange);

  return (
    <tr
      id={pieceAnchor(piece.id)}
      className="hover:bg-muted/30 scroll-mt-4"
      data-testid={`pieza-${piece.code}`}
    >
      <td className={CELL}>{checkbox}</td>
      <td className={CELL}>
        <PiecePhoto code={piece.code} url={photoUrl} />
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <Link
          href={pieceHref(piece)}
          className="text-heading font-medium underline-offset-4 hover:underline"
        >
          {piece.code}
        </Link>
        {live.urgent ? (
          <div className="mt-1">
            <UrgentBadge />
          </div>
        ) : null}
      </td>
      <td className={cn(CELL, "min-w-44")}>
        <p className="break-words">{piece.description}</p>
        {piece.notes ? (
          <p className="text-muted-foreground mt-1 text-xs break-words whitespace-pre-line">
            {piece.notes}
          </p>
        ) : null}
      </td>
      <td className={cn(CELL, "min-w-24")}>
        {piece.serviceName || <span className="text-muted-foreground">—</span>}
      </td>
      <td className={cn(CELL, "text-muted-foreground min-w-28")}>
        {materialSummary(piece)}
      </td>
      {showPrice ? (
        <td className={cn(CELL, "text-right")}>
          {editPrice ? (
            <SalePriceInput
              piece={{ id: piece.id, code: piece.code, restorationId }}
              cents={piece.priceCents}
              hasOrder={priceChange}
              editable
            />
          ) : piece.priceCents === null ? (
            // Precio de venta sin asignar (D58): lo asigna el admin.
            <span
              className="text-muted-foreground"
              data-testid="precio-sin-asignar"
            >
              Sin asignar
            </span>
          ) : (
            <span className="tabular-nums">
              {formatCents(piece.priceCents)}
            </span>
          )}
        </td>
      ) : null}
      <td className={cn(CELL, "min-w-32")}>
        <div className="flex flex-col items-start gap-1">
          <PieceStatusBadge status={live.status} />
          <LocationBadge location={live.location} />
          {pending ? (
            <Loader2
              className="text-muted-foreground size-4 animate-spin"
              aria-label="Guardando"
            />
          ) : null}
          {balanceWarning ? (
            <p className="text-destructive text-xs">Falta cobrar el saldo</p>
          ) : null}
        </div>
      </td>
      <td className={cn(CELL, "text-muted-foreground")}>
        {piece.workshopName ?? "Sin taller"}
      </td>
      <td className={cn(CELL, "text-right")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Acciones de ${piece.code}`}
            >
              Acciones
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-48"
            onCloseAutoFocus={() => {
              const action = chosen.current;
              chosen.current = null;
              action?.();
            }}
          >
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
            {actions.length > 0 ? <DropdownMenuSeparator /> : null}
            {canEdit ? (
              <DropdownMenuItem
                onSelect={() => {
                  chosen.current = () => setOpen("editar");
                }}
              >
                <Pencil aria-hidden />
                Editar
              </DropdownMenuItem>
            ) : null}
            {priceChange && piece.priceCents !== null ? (
              <DropdownMenuItem
                onSelect={() => {
                  chosen.current = () => setOpen("precio");
                }}
              >
                <Tag aria-hidden />
                Cambiar precio
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href={pieceHref(piece)}>
                <ChevronRight aria-hidden />
                Ver detalle
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {dialogs}
        {canEdit ? (
          <PieceDialog
            // Se monta de nuevo al abrir: el formulario parte de los datos actuales.
            key={open === "editar" ? "editar-abierto" : "editar-cerrado"}
            open={open === "editar"}
            onOpenChange={(next) => setOpen(next ? "editar" : null)}
            restorationId={restorationId}
            piece={piece}
            editable={editable}
            priceHint={editing.priceHint}
            workshops={workshops}
            materials={editing.materials}
            services={editing.services}
          />
        ) : null}
        {priceChange && piece.priceCents !== null ? (
          <PriceChangeDialog
            key={open === "precio" ? "precio-abierto" : "precio-cerrado"}
            open={open === "precio"}
            onOpenChange={(next) => setOpen(next ? "precio" : null)}
            restorationId={restorationId}
            piece={piece}
          />
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Piezas de la guía en tabla, como una hoja de cálculo (como /piezas): foto "Antes",
 * datos, precio de venta (admin y ventas; el admin lo ingresa, D58), estado y taller.
 * Las acciones de cada pieza (cambio de estado, llegada, taller, edición, cambio de
 * precio) van en su menú «Acciones»; arriba, la selección para acciones masivas.
 * La línea de tiempo de cada pieza está en su detalle (/piezas/[id]).
 */
export function PiecesBoard({
  restorationId,
  pieces,
  role,
  workshops,
  editing,
  photos = {},
  approvalPayment = null,
  balanceDue = false,
}: {
  restorationId: string;
  pieces: PieceDetail[];
  role: AppRole;
  workshops: WorkshopOption[];
  editing: PieceEditing | null;
  /** Primera foto "Antes" de cada pieza: id de la pieza → URL. */
  photos?: Record<string, string>;
  /** Pago al aprobar la última pieza (11.2); null si no corresponde. */
  approvalPayment?: ApprovalPayment | null;
  /** Falta cobrar el saldo para entregar (P45). */
  balanceDue?: boolean;
}) {
  // Por defecto están elegidas todas las piezas que admiten acciones: se guardan las
  // que la persona desmarca, así lo elegido sigue válido tras refrescar la página.
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const selectable = pieces.filter((p) => isSelectable(p, role));
  const chosen = selectable.filter((p) => !unchecked.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setUnchecked((u) => (on ? u.filter((x) => x !== id) : [...u, id]));
  const allChosen = chosen.length === selectable.length;
  // La última pieza por aprobar crea la orden: ahí se ofrece registrar el adelanto.
  const toApprove = pieces.filter((p) => PRE_APPROVAL.includes(p.status));
  const lastToApprove = toApprove.length === 1 ? toApprove[0]!.id : null;
  const showPrice = can(role, "dinero.ver");

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={restorationId}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setUnchecked([])}
        statusPicker
        total={selectable.length}
      />

      {selectable.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allChosen}
            ref={(el) => {
              if (el) el.indeterminate = !allChosen && chosen.length > 0;
            }}
            onChange={(e) =>
              setUnchecked(e.target.checked ? [] : selectable.map((p) => p.id))
            }
          />
          Elegir todas las piezas
        </label>
      ) : null}

      {/* `relative`: los textos sr-only (absolutos) quedan dentro del desplazamiento
          y no ensanchan la página en el celular. */}
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[60rem] border-collapse text-sm">
          <caption className="sr-only">Piezas de la guía</caption>
          <thead className="bg-muted/60 text-muted-foreground border-b text-xs">
            <tr>
              <th scope="col" className={cn(HEAD, "w-8")}>
                <span className="sr-only">Elegir</span>
              </th>
              <th scope="col" className={HEAD}>
                Foto antes
              </th>
              <th scope="col" className={HEAD}>
                Pieza
              </th>
              <th scope="col" className={HEAD}>
                Descripción
              </th>
              <th scope="col" className={HEAD}>
                Servicio
              </th>
              <th scope="col" className={HEAD}>
                Material · medida · peso
              </th>
              {showPrice ? (
                <th scope="col" className={cn(HEAD, "text-right")}>
                  Precio venta
                </th>
              ) : null}
              <th scope="col" className={HEAD}>
                Estado
              </th>
              <th scope="col" className={HEAD}>
                Taller
              </th>
              <th scope="col" className={cn(HEAD, "text-right")}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pieces.map((piece) => (
              <PieceRow
                key={piece.id}
                restorationId={restorationId}
                piece={piece}
                role={role}
                workshops={workshops}
                editing={editing}
                photoUrl={photos[piece.id] ?? null}
                approvalPayment={
                  piece.id === lastToApprove ? approvalPayment : null
                }
                balanceDue={balanceDue}
                checkbox={
                  isSelectable(piece, role) ? (
                    <input
                      type="checkbox"
                      className="accent-primary mt-1 size-4"
                      aria-label={`Elegir ${piece.code}`}
                      checked={!unchecked.includes(piece.id)}
                      onChange={(e) => toggle(piece.id, e.target.checked)}
                    />
                  ) : null
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
