"use server";

import { revalidatePath } from "next/cache";

import type { TablesInsert } from "@/lib/supabase/database.types";
import { createClient as createSupabase } from "@/lib/supabase/server";
import {
  clientSchema,
  contactSchema,
  type ClientFormInput,
  type ClientInput,
  type ContactFormInput,
  type ContactInput,
} from "@/lib/validation/clients";
import { requirePermission } from "@/server/auth";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

export type CreateClientResult =
  | { ok: true; id: string; displayName: string; kind: "persona" | "empresa" }
  | { error: string };

export type ActionResult = { ok: true } | { error: string };

/** Columnas de la tabla `clients` a partir de los datos validados. */
function clientRow(v: ClientInput): TablesInsert<"clients"> {
  const shared = {
    kind: v.kind,
    document_type: v.documentType,
    document_number: v.documentNumber,
    phone: v.phone,
    email: v.email,
    address: v.address,
    notes: v.notes,
  };
  return v.kind === "persona"
    ? { ...shared, first_name: v.firstName, last_name: v.lastName }
    : { ...shared, legal_name: v.legalName, city: v.city, region: v.region };
}

function contactRow(v: ContactInput) {
  return {
    first_name: v.firstName,
    last_name: v.lastName,
    position: v.position,
    document_type: v.documentType,
    document_number: v.documentNumber,
    phone: v.phone,
    email: v.email,
  };
}

const duplicateOr = (code: string | undefined, fallback: string) =>
  code === "23505" ? "Ya existe un registro con ese documento." : fallback;

function revalidateClient(id: string) {
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}

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

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("clients")
    .insert(clientRow(v))
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

/**
 * Edita los datos de un cliente (el tipo no cambia). Si ya está en Shopify, la BD
 * encola la actualización (P16).
 */
export async function updateClient(
  id: string,
  input: ClientFormInput,
): Promise<ActionResult> {
  await requirePermission("clientes.editar");
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("clients")
    .update(clientRow(parsed.data))
    .eq("id", id)
    .eq("kind", parsed.data.kind)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe un cliente con ese documento."
          : "No se pudo guardar el cliente.",
    };
  }
  if (data.length === 0) return { error: "El cliente no existe." };

  scheduleShopifySync();
  revalidateClient(id);
  return { ok: true };
}

/** Desactiva o reactiva un cliente (no se borran: tienen historial). */
export async function setClientActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requirePermission("clientes.editar");
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("clients")
    .update({ active })
    .eq("id", id)
    .select("id");
  if (error || data.length === 0) {
    return { error: "No se pudo cambiar el estado del cliente." };
  }
  revalidateClient(id);
  return { ok: true };
}

export type CreateContactResult =
  { ok: true; id: string; displayName: string } | { error: string };

/** Agrega un contacto a una empresa; la BD encola su alta en Shopify. */
export async function createContact(
  clientId: string,
  input: ContactFormInput,
): Promise<CreateContactResult> {
  await requirePermission("clientes.editar");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ client_id: clientId, ...contactRow(parsed.data) })
    .select("id, display_name")
    .single();
  if (error) {
    return {
      error: duplicateOr(error.code, "No se pudo registrar el contacto."),
    };
  }

  scheduleShopifySync();
  revalidateClient(clientId);
  return { ok: true, id: data.id, displayName: data.display_name ?? "" };
}

/** Edita un contacto; si ya está en Shopify, la BD encola la actualización (P16). */
export async function updateContact(
  id: string,
  input: ContactFormInput,
): Promise<ActionResult> {
  await requirePermission("clientes.editar");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .update(contactRow(parsed.data))
    .eq("id", id)
    .select("client_id");
  if (error) {
    return {
      error: duplicateOr(error.code, "No se pudo guardar el contacto."),
    };
  }
  if (data.length === 0) return { error: "El contacto no existe." };

  scheduleShopifySync();
  revalidateClient(data[0]!.client_id);
  return { ok: true };
}

/** Desactiva o reactiva un contacto (deja de aparecer en el buscador). */
export async function setContactActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requirePermission("clientes.editar");
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .update({ active })
    .eq("id", id)
    .select("client_id");
  if (error || data.length === 0) {
    return { error: "No se pudo cambiar el estado del contacto." };
  }
  revalidateClient(data[0]!.client_id);
  return { ok: true };
}
