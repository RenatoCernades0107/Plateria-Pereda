import "server-only";

import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * De dónde sale el nombre de cada detalle para el título de la pestaña del navegador
 * (con varias pestañas abiertas se distinguen por el código). La RLS decide qué se lee.
 */
const SOURCES = {
  restoration: { table: "restorations", column: "code", format: (v) => v },
  piece: { table: "pieces_operational", column: "code", format: (v) => v },
  client: { table: "clients", column: "display_name", format: (v) => v },
  quote: { table: "quotes", column: "code", format: (v) => v },
  whatsappQuote: { table: "whatsapp_quotes", column: "code", format: (v) => v },
  workshop: {
    table: "workshops",
    column: "name",
    format: (v) => `Piezas de ${v}`,
  },
} satisfies Record<
  string,
  { table: string; column: string; format: (value: string) => string }
>;

export type TitledRecord = keyof typeof SOURCES;

type LooseQuery = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
      };
    };
  };
};

/**
 * Título del detalle con el código del registro (p. ej. "RES-00012"); si el id no es
 * válido o no se puede leer, el genérico (`fallback`).
 */
export async function recordMetadata(
  kind: TitledRecord,
  id: string,
  fallback: string,
): Promise<Metadata> {
  if (!UUID.test(id)) return { title: fallback };
  const { table, column, format } = SOURCES[kind];
  const supabase = (await createClient()) as unknown as LooseQuery;
  const { data } = await supabase
    .from(table)
    .select(column)
    .eq("id", id)
    .maybeSingle();
  const value = data?.[column];
  return {
    title: typeof value === "string" && value.trim() ? format(value) : fallback,
  };
}
