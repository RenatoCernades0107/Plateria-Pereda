import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { publicEnv } from "@/lib/env";

import { createAdminClient } from "./admin";

describe("Supabase local", () => {
  it("el cliente administrador se conecta con la clave secreta", async () => {
    const { data, error } = await createAdminClient().auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("acepta la clave pública y tiene el registro público desactivado", async () => {
    const env = publicEnv();
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false } },
    );
    const { error } = await supabase.auth.signUp({
      email: "registro-publico@pereda.test",
      password: "Clave-de-prueba-123",
    });
    expect(error?.code).toBe("signup_disabled");
  });
});
