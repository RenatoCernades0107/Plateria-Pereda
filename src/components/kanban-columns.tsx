import { DraggableKanbanColumns } from "./kanban-drag";
import { KanbanCard, KanbanColumnFrame, KanbanList } from "./kanban-frame";

export { KanbanCard };

export type KanbanColumn<T> = {
  /** Estado de la columna (va en `data-testid="columna-<key>"`). */
  key: string;
  label: string;
  items: readonly T[];
  /**
   * Columna que solo se muestra mientras se arrastra una tarjeta que puede soltarse
   * en ella (o si ya tiene tarjetas).
   */
  dropOnly?: boolean;
};

/** Arrastrar tarjetas entre columnas (opcional). */
export type KanbanDrag<T> = {
  getId: (item: T) => string;
  /** Nombre de la tarjeta en la vista previa y en los avisos del lector de pantalla. */
  getLabel: (item: T) => string;
  /** Si la tarjeta puede soltarse en la columna (se resaltan las permitidas). */
  canDrop: (item: T, columnKey: string) => boolean;
  /**
   * Se llama al soltar la tarjeta en otra columna, permitida o no: quien la usa
   * valida, cambia el estado o avisa por qué no se puede.
   */
  onMove: (item: T, toColumnKey: string) => void;
};

/** Lo que recibe cada tarjeta cuando se puede arrastrar. */
export type KanbanCardDrag = {
  /** Asa para arrastrar con el teclado (y también con el ratón o el dedo). */
  handle: React.ReactNode;
  dragging: boolean;
};

export type KanbanColumnsProps<T> = {
  columns: readonly KanbanColumn<T>[];
  /** Nombre accesible de la lista de columnas (p. ej. "Piezas por estado"). */
  label: string;
  /** Texto de una columna vacía. */
  emptyText: string;
  renderCard: (item: T, drag?: KanbanCardDrag) => React.ReactNode;
  /** Sin `drag`, las columnas son fijas (p. ej. el kanban de guías). */
  drag?: KanbanDrag<T>;
};

/** Columnas que se ven sin arrastrar: las fijas y las de solo destino con tarjetas. */
export const shownColumns = <T,>(columns: readonly KanbanColumn<T>[]) =>
  columns.filter((c) => !c.dropOnly || c.items.length > 0);

/**
 * Columnas de un tablero kanban (piezas o restauraciones por estado). En el celular
 * se desplazan en horizontal dentro de su contenedor, sin mover la página. Cada
 * columna es un elemento de la lista con su título y el número de tarjetas. Con
 * `drag`, las tarjetas se mueven de columna arrastrándolas (ratón, dedo o teclado).
 */
export function KanbanColumns<T>(props: KanbanColumnsProps<T>) {
  if (props.drag)
    return <DraggableKanbanColumns {...props} drag={props.drag} />;
  const { columns, label, emptyText, renderCard } = props;
  return (
    <KanbanList label={label}>
      {shownColumns(columns).map((column) => (
        <KanbanColumnFrame
          key={column.key}
          columnKey={column.key}
          label={column.label}
          count={column.items.length}
          emptyText={emptyText}
        >
          {column.items.map((item) => renderCard(item))}
        </KanbanColumnFrame>
      ))}
    </KanbanList>
  );
}
