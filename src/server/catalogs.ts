import "server-only";

import type { CatalogKind } from "@/domain/catalogs";
import { createClient } from "@/lib/supabase/server";

export type CatalogItem = {
  id: string;
  name: string;
  price: number | null;
  active: boolean;
  /** Materiales y servicios: se propone ya elegido en cada pieza nueva. */
  isDefault?: boolean;
  /** Métodos de pago: nombre en Shopify (D34). */
  shopifyName?: string | null;
};

/** Nombres de los servicios (también los inactivos) por id, para el mensaje de WhatsApp. */
export async function serviceNamesById(): Promise<Map<string, string>> {
  const services = await listCatalog("services");
  return new Map(services.map((s) => [s.id, s.name]));
}

/** Ítems del catálogo, los activos primero; `onlyActive` para los selectores. */
export async function listCatalog(
  kind: CatalogKind,
  { onlyActive = false } = {},
): Promise<CatalogItem[]> {
  const supabase = await createClient();
  if (kind === "services") {
    let query = supabase
      .from("services")
      .select("id, name, suggested_price, active, is_default")
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
      isDefault: s.is_default,
    }));
  }

  if (kind === "branches") {
    let query = supabase
      .from("branches")
      .select("id, name, active")
      .order("active", { ascending: false })
      .order("name");
    if (onlyActive) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;
    return data.map((b) => ({ ...b, price: null }));
  }

  if (kind === "payment_methods") {
    let query = supabase
      .from("payment_methods")
      .select("id, name, active, shopify_name")
      .order("active", { ascending: false })
      .order("name");
    if (onlyActive) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;
    return data.map(({ shopify_name, ...m }) => ({
      ...m,
      price: null,
      shopifyName: shopify_name,
    }));
  }

  let query = supabase
    .from(kind)
    .select("id, name, active, is_default")
    .order("active", { ascending: false })
    .order("name");
  if (onlyActive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(({ is_default, ...m }) => ({
    ...m,
    price: null,
    isDefault: is_default,
  }));
}
