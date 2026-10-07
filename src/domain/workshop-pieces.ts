/** Tabla de piezas de un taller (`/talleres/[id]/piezas`), la que se le envía al proveedor. */

export const WORKSHOP_PIECES_PAGE_SIZE = 15;
/** "Ver todas" (para imprimir o guardar en PDF) trae hasta este tope de piezas. */
export const WORKSHOP_PIECES_ALL_LIMIT = 500;

export type WorkshopPiecesView = {
  page: number;
  all: boolean;
  /** Abre el diálogo de impresión al cargar (viene de "Descargar PDF" con varias páginas). */
  print: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export function parseWorkshopPiecesView(
  params: SearchParams,
): WorkshopPiecesView {
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    all: first(params.todas) === "1",
    print: first(params.imprimir) === "1",
  };
}

export function workshopPiecesHref(
  workshopId: string,
  view: Partial<WorkshopPiecesView> = {},
): string {
  const base = `/talleres/${workshopId}/piezas`;
  if (view.all) return `${base}?todas=1${view.print ? "&imprimir=1" : ""}`;
  return view.page && view.page > 1 ? `${base}?pagina=${view.page}` : base;
}

export function workshopPiecesArgs(
  workshopId: string,
  view: Pick<WorkshopPiecesView, "page" | "all">,
) {
  return view.all
    ? {
        p_workshop_id: workshopId,
        p_limit: WORKSHOP_PIECES_ALL_LIMIT,
        p_offset: 0,
      }
    : {
        p_workshop_id: workshopId,
        p_limit: WORKSHOP_PIECES_PAGE_SIZE,
        p_offset: (view.page - 1) * WORKSHOP_PIECES_PAGE_SIZE,
      };
}
