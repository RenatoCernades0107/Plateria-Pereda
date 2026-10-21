"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { serverEnv } from "@/lib/env.server";
import type { AppRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  newUserSchema,
  roleSchema,
  type NewUserInput,
} from "@/lib/validation/users";
import { requirePermission } from "@/server/auth";

export type UserActionResult = { ok: true } | { error: string };

const SELF_ERROR =
  "No puedes cambiar tu propio rol ni desactivarte: pídeselo a otro administrador.";

async function accessLink() {
  const origin = (await headers()).get("origin") ?? serverEnv().APP_URL;
  return `${origin}/auth/confirm?next=/restablecer-contrasena`;
}

function inviteErrorMessage(code: string | undefined) {
  switch (code) {
    case "email_exists":
    case "user_already_exists":
      return "Ya existe un usuario con ese email.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Se alcanzó el límite de correos por hora. Espera un rato e intenta de nuevo.";
    case "email_address_invalid":
    case "validation_failed":
      return "El email no es válido.";
    default:
      return "No se pudo crear el usuario. Intenta de nuevo.";
  }
}

/** Crea el usuario y le envía por correo el enlace para crear su contraseña. */
export async function createUser(
  input: NewUserInput,
): Promise<UserActionResult> {
  await requirePermission("usuarios.gestionar");
  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: { full_name: parsed.data.fullName },
      redirectTo: await accessLink(),
    },
  );
  if (error) {
    console.error("No se pudo invitar al usuario", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return { error: inviteErrorMessage(error.code) };
  }

  const { error: roleError } = await admin.auth.admin.updateUserById(
    data.user.id,
    {
      app_metadata: { role: parsed.data.role },
    },
  );
  if (roleError)
    return { error: "El usuario se creó, pero no se pudo asignar el rol." };

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

/**
 * Elimina a un usuario que aún no registró nada (solo el admin, nunca a sí mismo ni al
 * último admin activo). Primero borra su perfil con la sesión del admin: un trigger de la
 * BD lo rechaza si tiene actividad (23503, con un aviso que dice qué registró y sugiere
 * desactivarlo) y el borrado queda en la auditoría a nombre del admin. Después borra el
 * usuario de Supabase Auth; si eso falla, el perfil se restaura.
 */
export async function deleteUser(userId: string): Promise<UserActionResult> {
  const me = await requirePermission("usuarios.gestionar");
  if (userId === me.id) {
    return {
      error: "No puedes eliminarte a ti mismo: pídeselo a otro administrador.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId)
    .select("id, full_name, email, role, active, created_at");
  if (error) {
    return {
      error:
        error.code === "23503"
          ? error.message
          : "No se pudo eliminar el usuario.",
    };
  }
  // Sin permiso (RLS) o ya borrado: el delete no falla, solo no toca filas.
  const profile = data[0];
  if (!profile) return { error: "No se pudo eliminar el usuario." };

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("No se pudo borrar el usuario de Auth", {
      code: authError.code,
      status: authError.status,
      message: authError.message,
    });
    // Sin perfil no podría ingresar ni aparecería en la lista: se restaura.
    await admin.from("profiles").insert(profile);
    return { error: "No se pudo eliminar el usuario. Intenta de nuevo." };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

/** Envía un enlace para crear una nueva contraseña (sirve también si no usó la invitación). */
export async function resendAccess(userId: string): Promise<UserActionResult> {
  await requirePermission("usuarios.gestionar");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.email) return { error: "El usuario no tiene email." };

  const { error } = await createAdminClient().auth.resetPasswordForEmail(
    profile.email,
    {
      redirectTo: await accessLink(),
    },
  );
  if (error)
    return { error: "No se pudo enviar el correo. Intenta en unos minutos." };
  return { ok: true };
}
