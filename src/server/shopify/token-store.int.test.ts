import { afterEach, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";

import { supabaseTokenStore } from "./token-store";

const SHOP = `token-test-${Date.now()}.myshopify.com`;

describe("token de Shopify en la base de datos", () => {
  afterEach(async () => {
    await supabaseTokenStore.clear(SHOP);
  });

  it("guarda, reemplaza, lee y borra el token", async () => {
    expect(await supabaseTokenStore.read(SHOP)).toBeNull();

    const expiresAt = new Date("2026-10-04T12:00:00.000Z");
    await supabaseTokenStore.write(SHOP, { accessToken: "shpat_1", expiresAt });
    await supabaseTokenStore.write(SHOP, { accessToken: "shpat_2", expiresAt });
    expect(await supabaseTokenStore.read(SHOP)).toEqual({
      accessToken: "shpat_2",
      expiresAt,
    });

    await supabaseTokenStore.clear(SHOP);
    expect(await supabaseTokenStore.read(SHOP)).toBeNull();
  });

  it("los usuarios no pueden leer los tokens", async () => {
    await supabaseTokenStore.write(SHOP, {
      accessToken: "shpat_secreto",
      expiresAt: new Date(),
    });
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data, error } = await anon.from("shopify_tokens").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
    // Con la clave secreta sí existe.
    const admin = await createAdminClient()
      .from("shopify_tokens")
      .select("shop_domain")
      .eq("shop_domain", SHOP);
    expect(admin.data).toHaveLength(1);
  });
});
