"use server";

import { revalidatePath } from "next/cache";

import type { AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  newUserSchema,
  roleSchema,
  setPasswordSchema,
  type NewUserInput,
  type SetPasswordInput,
} from "@/lib/validation/users";
import { requirePermission } from "@/server/auth";

export type UserActionResult = { ok: true } | { error: string };

const SELF_ERROR =
  "No puedes cambiar tu propio rol ni desactivarte: pídeselo a otro administrador.";

function createErrorMessage(code: string | undefined) {
  switch (code) {
    case "email_exists":
    case "user_already_exists":
      return "Ya existe un usuario con ese email.";
    case "weak_password":
      return "La contraseña es muy débil. Usa una más larga o genera una.";
    case "email_address_invalid":
    case "validation_failed":
      return "El email no es válido.";
    default:
      return "No se pudo crear el usuario. Intenta de nuevo.";
  }
}

/** Crea el usuario con la contraseña que eligió el administrador (sin correos). */
export async function createUser(
  input: NewUserInput,
): Promise<UserActionResult> {
  await requirePermission("usuarios.gestionar");
  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  // El rol en app_metadata lo copia a `profiles` el trigger de alta.
  const { error } = await createAdminClient().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
    app_metadata: { role: parsed.data.role },
  });
  if (error) {
    console.error("No se pudo crear el usuario", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return { error: createErrorMessage(error.code) };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateUserRole(
  userId: string,
  role: AppRole,
): Promise<UserActionResult> {
  const me = await requirePermission("usuarios.gestionar");
  if (userId === me.id) return { error: SELF_ERROR };
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { error: "Elige un rol válido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data })
    .eq("id", userId);
  if (error) return { error: "No se pudo cambiar el rol." };

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<UserActionResult> {
  const me = await requirePermission("usuarios.gestionar");
  if (userId === me.id) return { error: SELF_ERROR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", userId);
  if (error) return { error: "No se pudo actualizar el usuario." };

  revalidatePath("/usuarios");
  return { ok: true };
}

/** El administrador le pone una nueva contraseña a un usuario (p. ej. si la olvidó). */
export async function setUserPassword(
  userId: string,
  input: SetPasswordInput,
): Promise<UserActionResult> {
  await requirePermission("usuarios.gestionar");
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa la contraseña ingresada." };

  const { error } = await createAdminClient().auth.admin.updateUserById(
    userId,
    { password: parsed.data.password },
  );
  if (error) {
    return {
      error:
        error.code === "weak_password"
          ? "La contraseña es muy débil. Usa una más larga o genera una."
          : "No se pudo cambiar la contraseña. Intenta de nuevo.",
    };
  }
  return { ok: true };
}
