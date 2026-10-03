import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { publicEnv } from "@/lib/env";

import type { Database } from "./database.types";

const PASSWORD = "Pereda-local-2026";

function anonClient() {
  const env = publicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false },
    },
  );
}

describe("inicio de sesión y perfiles", () => {
  it.each([
    ["admin@pereda.test", "admin", 3],
    ["ventas@pereda.test", "ventas", 1],
    ["logistica@pereda.test", "logistica", 1],
  ] as const)(
    "%s inicia sesión y ve los perfiles que le corresponden",
    async (email, role, visibles) => {
      const supabase = anonClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });
      expect(error).toBeNull();

      const { data } = await supabase.from("profiles").select("role");
      expect(data).toHaveLength(visibles);
      expect(data?.map((p) => p.role)).toContain(role);
    },
  );

  it("rechaza una contraseña incorrecta", async () => {
    const { error } = await anonClient().auth.signInWithPassword({
      email: "admin@pereda.test",
      password: "incorrecta",
    });
    expect(error?.code).toBe("invalid_credentials");
  });
});
