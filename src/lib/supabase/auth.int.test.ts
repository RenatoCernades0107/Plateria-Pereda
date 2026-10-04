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
  it("admin inicia sesión y ve el perfil de todos los usuarios", async () => {
    const supabase = anonClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: "admin@pereda.test",
      password: PASSWORD,
    });
    expect(error).toBeNull();

    // Otros tests crean usuarios temporales en paralelo: se verifica que estén los semilla.
    const { data } = await supabase.from("profiles").select("email");
    expect(data?.map((p) => p.email)).toEqual(
      expect.arrayContaining([
        "admin@pereda.test",
        "ventas@pereda.test",
        "logistica@pereda.test",
      ]),
    );
  });

  it.each([
    ["ventas@pereda.test", "ventas"],
    ["logistica@pereda.test", "logistica"],
  ] as const)(
    "%s inicia sesión y solo ve su propio perfil",
    async (email, role) => {
      const supabase = anonClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });
      expect(error).toBeNull();

      const { data } = await supabase.from("profiles").select("email, role");
      expect(data).toEqual([{ email, role }]);
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
