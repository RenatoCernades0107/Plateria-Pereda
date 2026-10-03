import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "clave-publica-de-prueba",
  SUPABASE_SECRET_KEY: "clave-secreta-de-prueba",
  APP_URL: "http://localhost:3000",
};

const shopifyLive = {
  SHOPIFY_MODE: "live",
  SHOPIFY_STORE_DOMAIN: "plateria-pereda.myshopify.com",
  SHOPIFY_CLIENT_ID: "client-id",
  SHOPIFY_CLIENT_SECRET: "client-secret",
  SHOPIFY_API_VERSION: "2026-07",
};

describe("parseServerEnv", () => {
  it("acepta un entorno local mínimo y aplica valores por defecto", () => {
    const env = parseServerEnv(base);
    expect(env.SHOPIFY_MODE).toBe("fake");
    expect(env.APP_TIMEZONE).toBe("America/Lima");
  });

  it("falla y nombra cada variable faltante", () => {
    expect(() => parseServerEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL: Falta definir[\s\S]*SUPABASE_SECRET_KEY: Falta definir[\s\S]*APP_URL: Falta definir/,
    );
  });

  it("trata los valores vacíos como faltantes", () => {
    expect(() =>
      parseServerEnv({ ...base, SUPABASE_SECRET_KEY: "  " }),
    ).toThrow("SUPABASE_SECRET_KEY: Falta definir esta variable");
  });

  it("falla con formatos inválidos", () => {
    expect(() =>
      parseServerEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: "127.0.0.1:54321" }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL: Debe ser una URL http(s) válida");
    expect(() => parseServerEnv({ ...base, SHOPIFY_MODE: "real" })).toThrow(
      'SHOPIFY_MODE: Debe ser "fake" o "live"',
    );
    expect(() =>
      parseServerEnv({
        ...base,
        ...shopifyLive,
        SHOPIFY_API_VERSION: "2026-05",
      }),
    ).toThrow("SHOPIFY_API_VERSION");
  });

  it("con SHOPIFY_MODE=live exige las credenciales de Shopify", () => {
    expect(() => parseServerEnv({ ...base, SHOPIFY_MODE: "live" })).toThrow(
      /SHOPIFY_STORE_DOMAIN: Es obligatoria[\s\S]*SHOPIFY_CLIENT_SECRET: Es obligatoria/,
    );
    expect(parseServerEnv({ ...base, ...shopifyLive }).SHOPIFY_MODE).toBe(
      "live",
    );
  });

  it("en producción no permite el Shopify falso", () => {
    expect(() =>
      parseServerEnv({
        ...base,
        VERCEL_ENV: "production",
        CRON_SECRET: "x".repeat(32),
      }),
    ).toThrow("SHOPIFY_MODE: En producción debe ser live");
  });

  it("en producción exige CRON_SECRET", () => {
    expect(() =>
      parseServerEnv({ ...base, ...shopifyLive, VERCEL_ENV: "production" }),
    ).toThrow("CRON_SECRET: Es obligatoria en producción");
    const env = parseServerEnv({
      ...base,
      ...shopifyLive,
      VERCEL_ENV: "production",
      CRON_SECRET: "x".repeat(32),
    });
    expect(env.VERCEL_ENV).toBe("production");
  });
});

describe("parsePublicEnv", () => {
  it("solo exige las variables públicas", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: base.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: base.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });
});
