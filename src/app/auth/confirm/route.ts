import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

/** Destino de los enlaces de los correos (recuperar contraseña, invitación): abre la sesión. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) redirect(safeNextPath(searchParams.get("next")));
  }
  redirect("/login?motivo=enlace-invalido");
}
