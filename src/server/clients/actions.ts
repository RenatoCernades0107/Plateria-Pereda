"use server";

import { revalidatePath } from "next/cache";

import { createClient as createSupabase } from "@/lib/supabase/server";
import { clientSchema, type ClientFormInput } from "@/lib/validation/clients";
import { requirePermission } from "@/server/auth";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

export type CreateClientResult =
  | { ok: true; id: string; displayName: string; kind: "persona" | "empresa" }
  | { error: string };

/**
 * Registra una persona o empresa. La misma transacción encola su alta en Shopify
 * (trigger de la BD) y se procesa apenas termina la respuesta.
 */
export async function createClient(
  input: ClientFormInput,
): Promise<CreateClientResult> {
  await requirePermission("clientes.editar");
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };
  const v = parsed.data;

  const row =
    v.kind === "persona"
      ? {
          kind: v.kind,
          first_name: v.firstName,
          last_name: v.lastName,
          document_type: v.documentType,
          document_number: v.documentNumber,
        }
      : {
          kind: v.kind,
          legal_name: v.legalName,
          document_type: v.documentType,
          document_number: v.documentNumber,
          city: v.city,
          region: v.region,
        };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      ...row,
      phone: v.phone,
      email: v.email,
      address: v.address,
      notes: v.notes,
    })
    .select("id, display_name")
    .single();
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe un cliente con ese documento."
          : "No se pudo registrar el cliente.",
    };
  }

  scheduleShopifySync();
  revalidatePath("/clientes");
  return {
    ok: true,
    id: data.id,
    displayName: data.display_name ?? "",
    kind: v.kind,
  };
}
