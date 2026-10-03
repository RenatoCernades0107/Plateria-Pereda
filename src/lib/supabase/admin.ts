import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env.server";

import type { Database } from "./database.types";

/** Cliente con la clave secreta: salta las políticas RLS. Solo para tareas del servidor. */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
