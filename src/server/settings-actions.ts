"use server";

import { revalidatePath } from "next/cache";

import { DEFAULT_WHATSAPP_TEMPLATE } from "@/domain/whatsapp-template";
import { createClient } from "@/lib/supabase/server";
import {
  settingsSchema,
  type SettingsFormInput,
} from "@/lib/validation/settings";
import { requirePermission } from "@/server/auth";
import { BRANDING_BUCKET } from "@/server/settings";

export type SettingsActionResult = { ok: true } | { error: string };

export async function updateSettings(
  input: SettingsFormInput,
): Promise<SettingsActionResult> {
  await requirePermission("configuracion.gestionar");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };
  const v = parsed.data;

  const template = v.whatsappTemplate.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      legal_name: v.legalName,
      ruc: v.ruc || null,
      address: v.address,
      phones: v.phones,
      email: v.email,
      quote_validity_days: v.quoteValidityDays,
      deposit_percent: v.depositPercent,
      // Igual a la de la aplicación o vacía: se guarda null para seguir sus mejoras.
      whatsapp_template:
        template === "" || template === DEFAULT_WHATSAPP_TEMPLATE
          ? null
          : template,
      terms: v.terms,
    })
    .eq("id", true);
  if (error) return { error: "No se pudo guardar la configuración." };

  revalidatePath("/configuracion");
  return { ok: true };
}

/**
 * Guarda el logo que el navegador ya subió al bucket "branding" (con la sesión del
 * admin) y borra el anterior. `path` null quita el logo.
 */
export async function setLogo(
  path: string | null,
): Promise<SettingsActionResult> {
  await requirePermission("configuracion.gestionar");
  if (path !== null && !/^logo\/[\w-]+\.(png|jpe?g|webp)$/.test(path)) {
    return { error: "Archivo de logo inválido." };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("settings")
    .select("logo_path")
    .single();
  if (readError) return { error: "No se pudo actualizar el logo." };

  const { error } = await supabase
    .from("settings")
    .update({ logo_path: path })
    .eq("id", true);
  if (error) return { error: "No se pudo actualizar el logo." };

  if (current.logo_path && current.logo_path !== path) {
    await supabase.storage.from(BRANDING_BUCKET).remove([current.logo_path]);
  }
  revalidatePath("/configuracion");
  return { ok: true };
}
