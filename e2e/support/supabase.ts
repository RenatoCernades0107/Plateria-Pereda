import { createClient } from "@supabase/supabase-js";

import type { AppRole } from "../../src/lib/roles";
import type { Database } from "../../src/lib/supabase/database.types";
import { readLocalSupabaseEnv } from "../../tests/support/supabase-local";

const MAILPIT_URL = "http://127.0.0.1:54324";

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

/** Último enlace recibido en Mailpit por `email` (espera hasta que llegue el correo). */
export async function latestEmailLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`,
    ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
    const id = search.messages[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`).then(
        (r) => r.json() as Promise<{ HTML: string }>,
      );
      const href = /href="([^"]+)"/.exec(message.HTML)?.[1];
      if (href) return href.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No llegó ningún correo para ${email}`);
}
