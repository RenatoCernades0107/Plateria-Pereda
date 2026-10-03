import "server-only";

import type { CatalogKind } from "@/domain/catalogs";
import { createClient } from "@/lib/supabase/server";

export type CatalogItem = {
  id: string;
  name: string;
  price: number | null;
  active: boolean;
};

/** Ítems del catálogo, los activos primero; `onlyActive` para los selectores. */
export async function listCatalog(
  kind: CatalogKind,
  { onlyActive = false } = {},
): Promise<CatalogItem[]> {
  const supabase = await createClient();
  if (kind === "services") {
    let query = supabase
      .from("services")
      .select("id, name, suggested_price, active")
      .order("active", { ascending: false })
      .order("name");
    if (onlyActive) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;
    return data.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.suggested_price === null ? null : Number(s.suggested_price),
      active: s.active,
    }));
  }

  let query = supabase
    .from(kind)
    .select("id, name, active")
    .order("active", { ascending: false })
    .order("name");
  if (onlyActive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((i) => ({ ...i, price: null }));
}
