import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

const MOTIVOS = new Set(["inactivo"]);

/** Cierra la sesión de un usuario que ya no puede ingresar (p. ej., fue desactivado). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const motivo = request.nextUrl.searchParams.get("motivo");
  redirect(
    motivo && MOTIVOS.has(motivo) ? `/login?motivo=${motivo}` : "/login",
  );
}
