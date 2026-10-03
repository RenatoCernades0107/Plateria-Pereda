import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
};

type AuthState =
  | { status: "anonimo" }
  | { status: "inactivo" }
  | { status: "activo"; user: CurrentUser };

export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonimo" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active) return { status: "inactivo" };

  return {
    status: "activo",
    user: {
      id: user.id,
      email: user.email ?? "",
      fullName: profile.full_name,
      role: profile.role,
    },
  };
});

/** Usuario activo o redirección: al login si no hay sesión, a cerrar sesión si fue desactivado. */
export async function requireUser(): Promise<CurrentUser> {
  const state = await getAuthState();
  if (state.status === "anonimo") redirect("/login");
  if (state.status === "inactivo") redirect("/auth/salir?motivo=inactivo");
  return state.user;
}
