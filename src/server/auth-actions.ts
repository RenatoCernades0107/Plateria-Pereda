"use server";

import { redirect } from "next/navigation";

import { MENSAJE_INACTIVO } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

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
