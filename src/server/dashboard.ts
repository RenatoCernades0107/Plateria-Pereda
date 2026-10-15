import "server-only";

import { PIECE_PRESETS, RESTORATION_PRESETS } from "@/domain/filter-presets";
import {
  listPiecesBoardArgs,
  parsePieceBoardFilters,
  pieceBoardHref,
  type PieceBoardFilters,
} from "@/domain/piece-board-filters";
import {
  listRestorationsArgs,
  parseRestorationFilters,
  restorationFiltersHref,
  type RestorationFilters,
} from "@/domain/restoration-filters";
import { createClient } from "@/lib/supabase/server";

export type DashboardCount = {
  key: string;
  label: string;
  count: number;
  /** El listado con ese filtro aplicado. */
  href: string;
};

/**
 * Pendientes del inicio (S13 de MejorasUI.md, versión mínima): cuántas piezas y
 * restauraciones hay en cada filtro de un clic, con el enlace al listado filtrado.
 * Solo se cuenta (una fila por consulta). Los de pago, solo para quien ve montos.
 */
export async function dashboardCounts({
  showMoney,
}: {
  showMoney: boolean;
}): Promise<{ pieces: DashboardCount[]; restorations: DashboardCount[] }> {
  const supabase = await createClient();
  const pieceBase = parsePieceBoardFilters({});
  const restorationBase = parseRestorationFilters({});
  const restorationPresets = RESTORATION_PRESETS.filter(
    (p) => showMoney || !p.key.startsWith("pago"),
  );

  const countPieces = async (filters: PieceBoardFilters) => {
    const { data, error } = await supabase.rpc("list_pieces_board", {
      ...listPiecesBoardArgs(filters),
      p_limit: 1,
      p_offset: 0,
    });
    if (error) throw error;
    return Number(data[0]?.total_count ?? 0);
  };
  const countRestorations = async (filters: RestorationFilters) => {
    const { data, error } = await supabase.rpc(
      "list_restorations",
      listRestorationsArgs({ ...filters, scope: "todas" }, { limit: 1 }),
    );
    if (error) throw error;
    return Number(data[0]?.total_count ?? 0);
  };

  const [pieces, restorations] = await Promise.all([
    Promise.all(
      PIECE_PRESETS.map(async (p) => ({
        key: p.key,
        label: p.label,
        count: await countPieces({ ...pieceBase, ...p.on }),
        href: pieceBoardHref(pieceBase, p.on),
      })),
    ),
    Promise.all(
      restorationPresets.map(async (p) => ({
        key: p.key,
        label: p.label,
        count: await countRestorations({ ...restorationBase, ...p.on }),
        href: restorationFiltersHref(restorationBase, p.on),
      })),
    ),
  ]);
  return { pieces, restorations };
}
