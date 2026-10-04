"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  restorationSchema,
  type RestorationFormInput,
} from "@/lib/validation/restorations";
import { requirePermission } from "@/server/auth";

import { createRestorationRecord } from "./create";

export type CreateRestorationResult =
  { ok: true; id: string; code: string } | { error: string };

const ERRORS: Record<string, string> = {
  "23503":
    "El cliente, el contacto o un elemento elegido ya no existe o está desactivado.",
  "23514": "Revisa los datos de las piezas.",
  "42501": "No tienes permiso para registrar restauraciones.",
};

/** Registra una restauración con sus piezas (todo o nada, RPC `create_restoration`). */
export async function createRestoration(
  input: RestorationFormInput,
): Promise<CreateRestorationResult> {
  await requirePermission("restauraciones.editar");
  const parsed = restorationSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  try {
    const created = await createRestorationRecord(
      await createClient(),
      parsed.data,
    );
    revalidatePath("/restauraciones");
    return { ok: true, ...created };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return { error: ERRORS[code] ?? "No se pudo registrar la restauración." };
  }
}
