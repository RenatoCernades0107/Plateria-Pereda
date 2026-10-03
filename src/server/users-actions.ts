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
    return {
      error:
        error.code === "email_exists"
          ? "Ya existe un usuario con ese email."
          : "No se pudo crear el usuario. Intenta de nuevo.",
    };
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
