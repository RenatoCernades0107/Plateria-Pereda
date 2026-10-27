"use client";

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { DRAG_SCROLL_CLASS, useDragScroll } from "@/components/use-drag-scroll";
import type { ApprovalPayment } from "@/components/payments/piece-payment-dialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { can } from "@/domain/permissions";
import {
  salePriceEditing,
  type PieceEditableField,
} from "@/domain/restoration-edit";
import {
  isChargedKind,
  type RestorationKind,
} from "@/domain/restoration-status";
import { pieceAnchor, pieceHref } from "@/domain/restoration-pieces-view";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { PieceDetail } from "@/server/restorations/queries";

import { PieceDialog } from "./edit-dialogs";
import type { CatalogOption, WorkshopOption } from "./piece-fields";
import { PieceSaleAmount, SalePriceCell } from "./piece-money-cells";
import { RT } from "./responsive-table";
import { materialSummary, PiecePhoto } from "./piece-photo";
import {
  ActionIcon,
  arrangeActions,
  usePieceActions,
} from "./piece-status-actions";
import { PriceChangeDialog } from "./price-change-dialog";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import {
  isPieceInReview,
  ReviewBadge,
  LocationBadge,
  PieceQuantity,
  PieceStatusBadge,
  UrgentIcon,
} from "./status-badges";
import { canToggleUrgent, DeliveryDate, UrgentToggle } from "./urgent-toggle";

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
const CELL = cn(RT.cell, "md:px-2");
const LABELED = cn(CELL, RT.labeled);
// Casilla, foto y código quedan fijos al desplazarse de lado: anchos fijos (con el
// `md:px-2` de las celdas) para calcular dónde empieza cada una.
const STICKY = {
  check: cn(RT.sticky, "md:left-0 md:w-8 md:min-w-8"),
  photo: cn(RT.sticky, "md:left-8 md:w-18 md:min-w-18"),
  code: cn(RT.sticky, RT.stickyEdge, "md:left-26"),
};

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
  /** Tipo de guía: interna u observada no llevan precio de venta. */
  guideKind: RestorationKind;
  /** La guía ya tiene orden de Shopify (el precio asignado se cambia con motivo). */
  hasOrder: boolean;
};

/** Una fila de la tabla: datos de la pieza, su paso siguiente y su menú «Acciones». */
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
  guideKind,
  hasOrder,
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
  const { primary } = arrangeActions(actions);
  const regular = actions.filter((a) => !a.destructive);
  const closing = actions.filter((a) => a.destructive);
  const [open, setOpen] = useState<"editar" | "precio" | null>(null);
  // Lo elegido en el menú se hace cuando el menú terminó de cerrarse (y devolvió el
  // foco a su botón): así el diálogo que se abre recibe el foco y lo devuelve al cerrar.
  const chosen = useRef<(() => void) | null>(null);

  const editable = editing?.editable[piece.id] ?? [];
  const canEdit = editing !== null && editable.length > 0;
  const charged = isChargedKind(guideKind);
  // Precio de venta (admin, ventas y logística): con el formulario de edición manda lo que
  // éste permite; sin él (logística), las mismas reglas por pieza.
  const salePrice = editing
    ? {
        editable: editable.includes("price"),
        needsOrderFlow: Boolean(editing.priceChange?.[piece.id]),
      }
    : salePriceEditing({ role, hasOrder }, piece);
  const priceChange = charged && salePrice.needsOrderFlow;
  const showPrice = can(role, "piezas.precio-venta.ver") && charged;
  const editPrice =
    can(role, "piezas.precio-venta") &&
    charged &&
    (salePrice.editable || priceChange);
  const urgentToggle = canToggleUrgent(live, role);
  const details = [piece.serviceName, materialSummary(piece)]
    .filter((v) => v && v !== "—")
    .join(" · ");

  return (
    <tr
      id={pieceAnchor(piece.id)}
      className={cn("scroll-mt-4", RT.hoverRow, RT.row)}
      data-testid={`pieza-${piece.code}`}
    >
      <td className={cn(CELL, STICKY.check)}>{checkbox}</td>
      <td className={cn(CELL, STICKY.photo)}>
        <PiecePhoto code={piece.code} url={photoUrl} />
      </td>
      <td className={cn(CELL, STICKY.code, "whitespace-nowrap")}>
        {/* Urgente: solo el rayo, al costado del código, como la cantidad. */}
        <span className="inline-flex items-center gap-1">
          <Link
            href={pieceHref(piece)}
            className="text-heading font-medium underline-offset-4 hover:underline"
          >
            {piece.code}
          </Link>
          <PieceQuantity quantity={piece.quantity} />
          {live.urgent ? <UrgentIcon /> : null}
        </span>
        {/* Fecha estimada de entrega de la urgente; quien puede marcar urgente la coloca. */}
        {live.urgent ? (
          <DeliveryDate
            piece={{
              id: piece.id,
              code: piece.code,
              estimatedDeliveryDate: live.estimatedDeliveryDate,
            }}
            editable={urgentToggle}
            className="mt-0.5 flex"
          />
        ) : null}
      </td>
      <td className={cn(CELL, RT.full, "min-w-40")}>
        <p className="break-words">{piece.description}</p>
        {details ? (
          <p className="text-muted-foreground mt-0.5 text-xs break-words">
            {details}
          </p>
        ) : null}
        {piece.notes ? (
          <p className="text-muted-foreground mt-1 text-xs break-words whitespace-pre-line">
            {piece.notes}
          </p>
        ) : null}
      </td>
      {showPrice ? (
        <td className={cn(LABELED, "md:text-right")} data-label="Precio venta">
          {/* Lápiz solo con el precio por definir; uno ya asignado se cambia desde
              «Acciones» o el detalle de la pieza. */}
          {editPrice && piece.priceCents === null ? (
            <SalePriceCell
              piece={{ id: piece.id, code: piece.code, restorationId }}
              cents={piece.priceCents}
              quantity={piece.quantity}
              hasOrder={priceChange}
              editable
            />
          ) : piece.priceCents === null ? (
            // Precio de venta sin asignar (D58): lo asigna el admin.
            <span
              className="text-muted-foreground"
              data-testid="precio-sin-asignar"
            >
              Por definir
            </span>
          ) : (
            // El importe (precio × cantidad) y, con varias unidades, el c/u debajo.
            <PieceSaleAmount
              cents={piece.priceCents}
              quantity={piece.quantity}
            />
          )}
        </td>
      ) : null}
      <td className={cn(LABELED, "min-w-32")} data-label="Estado">
        <div className="flex flex-col items-start gap-1">
          <PieceStatusBadge status={live.status} />
          <LocationBadge location={live.location} />
          {isPieceInReview(live) ? <ReviewBadge /> : null}
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
      <td
        className={cn(LABELED, "text-muted-foreground break-words")}
        data-label="Taller"
      >
        {piece.workshopName ?? "Sin taller"}
      </td>
      <td className={cn(CELL, "max-md:basis-full md:text-right")}>
        {/*
          El siguiente paso natural (como en el detalle de la pieza) va a la vista,
          relleno; todas las acciones, en el menú «Acciones». En el celular, ambos
          botones con texto a lo ancho de la tarjeta; en la tabla, el paso siguiente
          solo con su ícono, para que entre sin desplazarse de lado.
        */}
        <div className="flex items-center gap-2 max-md:w-full md:justify-end">
          {urgentToggle ? (
            <UrgentToggle
              piece={{
                id: piece.id,
                code: piece.code,
                urgent: live.urgent,
                estimatedDeliveryDate: live.estimatedDeliveryDate,
              }}
            />
          ) : null}
          {primary ? (
            <Button
              size="sm"
              disabled={primary.disabled}
              onClick={primary.onSelect}
              aria-label={`${primary.label}: ${piece.code}`}
              title={primary.label}
              className="wide:max-[95rem]:hidden max-md:flex-1 md:size-8 md:has-[>svg]:px-0"
            >
              <ActionIcon action={primary} />
              <span className="md:sr-only">{primary.label}</span>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/*
                En el detalle a dos columnas con la pantalla justa (1440–1520 px), solo
                el ícono ⋯ para que la tabla entre sin desplazarse de lado.
              */}
              <Button
                variant="outline"
                size="sm"
                aria-label={`Acciones de ${piece.code}`}
                title="Acciones"
                className="data-[state=open]:bg-accent wide:max-[95rem]:has-[>svg]:px-2 max-md:flex-1"
              >
                <MoreHorizontal aria-hidden />
                <span className="wide:max-[95rem]:hidden">Acciones</span>
                <ChevronDown
                  aria-hidden
                  className="text-muted-foreground wide:max-[95rem]:hidden"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56"
              onCloseAutoFocus={() => {
                const action = chosen.current;
                chosen.current = null;
                action?.();
              }}
            >
              {regular.length > 0 ? (
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    Cambiar estado
                  </DropdownMenuLabel>
                  {regular.map((a) => (
                    <DropdownMenuItem
                      key={a.key}
                      disabled={a.disabled}
                      onSelect={() => {
                        chosen.current = a.onSelect;
                      }}
                    >
                      <ActionIcon action={a} />
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
              {closing.length > 0 ? (
                <>
                  {regular.length > 0 ? <DropdownMenuSeparator /> : null}
                  {/* Los cierres no se deshacen: apartados, en rojo y con confirmación. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-muted-foreground text-xs">
                      Cerrar la pieza
                    </DropdownMenuLabel>
                    {closing.map((a) => (
                      <DropdownMenuItem
                        key={a.key}
                        disabled={a.disabled}
                        variant="destructive"
                        onSelect={() => {
                          chosen.current = a.onSelect;
                        }}
                      >
                        <ActionIcon action={a} />
                        {a.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              ) : null}
              {actions.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
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
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
            guideKind={guideKind}
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
 * datos, precio de venta (admin, ventas y logística; lo ingresan el admin y logística,
 * D58), estado y taller. El rayo de cada fila marca o quita "Urgente".
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
  guideKind = "normal",
  hasOrder = false,
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
  /** Tipo de guía: interna u observada no muestran precios. */
  guideKind?: RestorationKind;
  /** La guía ya tiene orden de Shopify. */
  hasOrder?: boolean;
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
  const showPrice =
    can(role, "piezas.precio-venta.ver") && isChargedKind(guideKind);

  const dragScroll = useDragScroll<HTMLDivElement>();
  if (pieces.length === 0) {
    return <EmptyState>La guía aún no tiene piezas.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={restorationId}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setUnchecked([])}
        onClear={() => setUnchecked(selectable.map((p) => p.id))}
        alwaysVisible
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
      <div ref={dragScroll} className={cn(RT.wrapper, DRAG_SCROLL_CLASS)}>
        <table className={cn(RT.table, "md:min-w-[48rem]")}>
          <caption className="sr-only">Piezas de la guía</caption>
          <thead className={RT.thead}>
            <tr>
              <th scope="col" className={cn(HEAD, "w-8", STICKY.check)}>
                <span className="sr-only">Elegir</span>
              </th>
              <th scope="col" className={cn(HEAD, STICKY.photo)}>
                Foto antes
              </th>
              <th scope="col" className={cn(HEAD, STICKY.code)}>
                Pieza
              </th>
              <th scope="col" className={HEAD}>
                Descripción
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
          <tbody className={RT.tbody}>
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
                guideKind={guideKind}
                hasOrder={hasOrder}
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
