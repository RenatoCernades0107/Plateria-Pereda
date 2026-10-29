import { createBrowserClient } from "@supabase/ssr";

import { browserEnv } from "@/lib/env.browser";

import type { Database } from "./database.types";

export function createClient() {
  const env = browserEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
