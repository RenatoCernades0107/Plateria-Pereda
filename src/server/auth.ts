import "server-only";

import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { can, type Permission } from "@/domain/permissions";
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
  // getClaims verifica el JWT localmente (claves asimétricas) sin ir al servidor de Auth
  // en cada render; getUser hacía una petición de red extra por navegación.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { status: "anonimo" };
  const user = { id: claims.sub, email: claims.email };

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

/** Usuario con el permiso indicado; si no lo tiene, responde 403. */
export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) forbidden();
  return user;
}
