"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MENSAJE_INACTIVO } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/paths";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  recoverPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type RecoverPasswordInput,
  type ResetPasswordInput,
} from "@/lib/validation/auth";

export type ActionResult = { error: string } | { ok: true };

export async function login(
  input: LoginInput,
  next?: string | null,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error:
        error.code === "invalid_credentials"
          ? "Email o contraseña incorrectos."
          : "No se pudo iniciar sesión. Intenta de nuevo en unos minutos.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: MENSAJE_INACTIVO };
  }

  redirect(safeNextPath(next));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function requestPasswordReset(
  input: RecoverPasswordInput,
): Promise<ActionResult> {
  const parsed = recoverPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "Ingresa un email válido." };

  const origin = (await headers()).get("origin") ?? serverEnv().APP_URL;
  const supabase = await createClient();
  // La respuesta es la misma exista o no el email, para no revelar qué usuarios hay.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/restablecer-contrasena`,
  });
  return { ok: true };
}

export async function resetPassword(
  input: ResetPasswordInput,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa la contraseña ingresada." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "La nueva contraseña debe ser distinta de la anterior."
          : "No se pudo cambiar la contraseña. Pide un nuevo enlace.",
    };
  }
  redirect("/");
}
