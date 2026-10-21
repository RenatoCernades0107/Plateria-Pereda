import { createClient } from "@supabase/supabase-js";

import type { AppRole } from "../../src/lib/roles";
import type { Database } from "../../src/lib/supabase/database.types";
import { readLocalSupabaseEnv } from "../../tests/support/supabase-local";

export function adminClient() {
  const env = readLocalSupabaseEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

/** Crea un usuario temporal para un test; devuélvelo con `deleteTestUser` al terminar. */
export async function createTestUser(
  role: AppRole,
  password: string,
  fullName = `Prueba ${role}`,
) {
  const email = `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@pereda.test`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

/** Cliente con la sesión de un usuario: sus cambios pasan por RLS y quedan a su nombre. */
export async function userClient(email: string, password: string) {
  const env = readLocalSupabaseEnv();
  const client = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function deleteTestUser(id: string) {
  await adminClient().auth.admin.deleteUser(id);
}

export async function setUserActive(id: string, active: boolean) {
  const { error } = await adminClient()
    .from("profiles")
    .update({ active })
    .eq("id", id);
  if (error) throw error;
}
