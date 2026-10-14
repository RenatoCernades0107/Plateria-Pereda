"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type {
  KanbanCardDrag,
  KanbanColumn,
  KanbanColumnsProps,
  KanbanDrag,
} from "./kanban-columns";
import { KanbanCard, KanbanColumnFrame, KanbanList } from "./kanban-frame";

/** Estado de una columna mientras se arrastra (va en `data-drop`). */
export type DropState = "origen" | "permitida" | "bloqueada";

export function dropState<T>(
  drag: Pick<KanbanDrag<T>, "canDrop">,
  active: { item: T; from: string } | null,
  columnKey: string,
): DropState | undefined {
  if (!active) return undefined;
  if (columnKey === active.from) return "origen";
  return drag.canDrop(active.item, columnKey) ? "permitida" : "bloqueada";
}

/** Con el puntero, la columna bajo él; con el teclado, la que más cubre la tarjeta. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

/**
 * Con el teclado, las flechas izquierda y derecha llevan la tarjeta al centro de la
 * columna vecina (en lugar de moverla de a pocos píxeles).
 */
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  const arrows = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];
  if (!arrows.includes(event.code)) return undefined;
  event.preventDefault();
  const direction =
    event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!direction || !collisionRect) return undefined;

  const center = collisionRect.left + collisionRect.width / 2;
  const rects = droppableContainers
    .getEnabled()
    .map((container) => droppableRects.get(container.id))
    .filter((rect): rect is ClientRect => rect !== undefined)
    .sort((a, b) => a.left - b.left);
  const middle = (rect: ClientRect) => rect.left + rect.width / 2;
  const next =
    direction > 0
      ? rects.find((rect) => middle(rect) > center + 1)
      : rects.findLast((rect) => middle(rect) < center - 1);
  if (!next) return undefined;
  return {
    x: next.left + (next.width - collisionRect.width) / 2,
    y: currentCoordinates.y,
  };
};

const SCREEN_READER_INSTRUCTIONS =
  "Para mover la tarjeta a otro estado, pulsa espacio o Enter. Usa las flechas izquierda y derecha para pasar de columna, espacio o Enter para soltarla y Escape para cancelar. También puedes usar el botón «Mover a…».";

/** Elementos de la tarjeta que se pulsan: no empiezan el arrastre con el ratón. */
const INTERACTIVE =
  "a, button, input, select, textarea, label, [role=menuitem]";

/** Tarjeta que se arrastra con el ratón o el dedo desde su cuerpo, o desde el asa. */
function DraggableCard({
  id,
  column,
  label,
  children,
}: {
  id: string;
  column: string;
  label: string;
  children: (drag: KanbanCardDrag) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id,
      data: { column },
      attributes: { roleDescription: "tarjeta arrastrable" },
    });
  const fromBody =
    (name: "onMouseDown" | "onTouchStart") => (event: React.SyntheticEvent) => {
      const target = event.target as Element;
      if (target.closest(INTERACTIVE)) return;
      listeners?.[name]?.(event);
    };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Arrastrar ${label}`}
      className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-[3px] active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      className={cn("cursor-grab", isDragging && "opacity-40")}
      onMouseDown={fromBody("onMouseDown")}
      onTouchStart={fromBody("onTouchStart")}
    >
      {children({ handle, dragging: isDragging })}
    </div>
  );
}

function DroppableColumn<T>({
  column,
  state,
  emptyText,
  children,
}: {
  column: KanbanColumn<T>;
  state: DropState | undefined;
  emptyText: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <KanbanColumnFrame
      ref={setNodeRef}
      columnKey={column.key}
      label={column.label}
      count={column.items.length}
      emptyText={emptyText}
      data-drop={state}
      className={cn(
        state === "permitida" &&
          "border-primary/60 bg-primary/5 ring-primary/30 ring-2",
        state === "permitida" && isOver && "bg-primary/10 ring-primary",
        state === "bloqueada" && "opacity-50",
      )}
    >
      {children}
    </KanbanColumnFrame>
  );
}

/**
 * Columnas con arrastrar y soltar (dnd-kit): ratón, dedo (pulsación larga) y
 * teclado. Mientras se arrastra se resaltan las columnas permitidas y se atenúan
 * las demás; los avisos del lector de pantalla van en español.
 */
export function DraggableKanbanColumns<T>({
  columns,
  label,
  emptyText,
  renderCard,
  drag,
}: KanbanColumnsProps<T> & { drag: KanbanDrag<T> }) {
  const id = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnKeyboardCoordinates,
    }),
  );
  const [active, setActive] = useState<{ item: T; from: string } | null>(null);
  /** Ya salió de su columna: al volver se avisa (al empezar, no tapa el aviso inicial). */
  const leftOrigin = useRef(false);

  const find = (itemId: UniqueIdentifier) => {
    for (const column of columns) {
      const item = column.items.find((i) => drag.getId(i) === itemId);
      if (item !== undefined) return { item, from: column.key };
    }
    return null;
  };
  const columnLabel = (key: UniqueIdentifier) =>
    columns.find((c) => c.key === key)?.label ?? String(key);
  const nameOf = (itemId: UniqueIdentifier) => {
    const found = find(itemId);
    return found ? drag.getLabel(found.item) : "La tarjeta";
  };
  const allowedLabels = (found: { item: T; from: string }) =>
    columns
      .filter((c) => c.key !== found.from && drag.canDrop(found.item, c.key))
      .map((c) => c.label);

  const announcements: Announcements = {
    onDragStart({ active: a }) {
      const found = find(a.id);
      if (!found) return undefined;
      const allowed = allowedLabels(found);
      return `Tomaste ${drag.getLabel(found.item)}, en ${columnLabel(found.from)}. ${
        allowed.length > 0
          ? `Puede ir a: ${allowed.join(", ")}.`
          : "No hay estados a los que pueda pasar."
      }`;
    },
    onDragOver({ active: a, over }) {
      const found = find(a.id);
      if (!found) return undefined;
      const name = drag.getLabel(found.item);
      if (!over) return `${name} no está sobre ninguna columna.`;
      if (over.id === found.from)
        return leftOrigin.current
          ? `${name} volvió a ${columnLabel(over.id)}.`
          : undefined;
      leftOrigin.current = true;
      return drag.canDrop(found.item, String(over.id))
        ? `${name} está sobre ${columnLabel(over.id)}.`
        : `${name} está sobre ${columnLabel(over.id)}: ahí no se puede soltar.`;
    },
    onDragEnd({ active: a, over }) {
      const found = find(a.id);
      const name = nameOf(a.id);
      if (!found || !over || over.id === found.from)
        return `Soltaste ${name}; no cambió de estado.`;
      return drag.canDrop(found.item, String(over.id))
        ? `Soltaste ${name} en ${columnLabel(over.id)}.`
        : `${name} no puede pasar a ${columnLabel(over.id)}.`;
    },
    onDragCancel({ active: a }) {
      return `Se canceló el arrastre de ${nameOf(a.id)}.`;
    },
  };

  const visible = columns.filter(
    (c) =>
      !c.dropOnly ||
      c.items.length > 0 ||
      dropState(drag, active, c.key) === "permitida",
  );

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      }}
      onDragStart={({ active: a }) => {
        leftOrigin.current = false;
        setActive(find(a.id));
      }}
      onDragCancel={() => setActive(null)}
      onDragEnd={({ active: a, over }) => {
        const found = find(a.id);
        setActive(null);
        if (found && over && over.id !== found.from)
          drag.onMove(found.item, String(over.id));
      }}
    >
      <KanbanList label={label}>
        {visible.map((column) => (
          <DroppableColumn
            key={column.key}
            column={column}
            state={dropState(drag, active, column.key)}
            emptyText={emptyText}
          >
            {column.items.map((item) => {
              const itemId = drag.getId(item);
              return (
                <DraggableCard
                  key={itemId}
                  id={itemId}
                  column={column.key}
                  label={drag.getLabel(item)}
                >
                  {(cardDrag) => renderCard(item, cardDrag)}
                </DraggableCard>
              );
            })}
          </DroppableColumn>
        ))}
      </KanbanList>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <KanbanCard className="cursor-grabbing font-medium shadow-lg">
            {drag.getLabel(active.item)}
          </KanbanCard>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
