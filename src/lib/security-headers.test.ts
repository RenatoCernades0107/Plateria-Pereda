import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name);

describe("contentSecurityPolicy", () => {
  const prod = contentSecurityPolicy({
    supabaseUrl: "https://abc.supabase.co",
    isDev: false,
  });

  it("permite Supabase (API, Storage y Realtime) y el CDN de Shopify", () => {
    expect(directive(prod, "connect-src")).toBe(
      "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co https://cdn.shopify.com",
    );
    expect(directive(prod, "img-src")).toContain("https://abc.supabase.co");
    expect(directive(prod, "img-src")).toContain("https://cdn.shopify.com");
  });

  it("no permite eval en producción, ni objetos, ni que otro sitio lo enmarque", () => {
    expect(directive(prod, "script-src")).not.toContain("unsafe-eval");
    expect(directive(prod, "object-src")).toBe("object-src 'none'");
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(prod, "form-action")).toBe("form-action 'self'");
    expect(directive(prod, "upgrade-insecure-requests")).toBeDefined();
  });

  it("en local acepta Supabase por http y el eval de React en desarrollo", () => {
    const dev = contentSecurityPolicy({
      supabaseUrl: "http://127.0.0.1:54321",
      isDev: true,
    });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws://127.0.0.1:54321");
    expect(directive(dev, "upgrade-insecure-requests")).toBeUndefined();
  });
});

describe("securityHeaders", () => {
  it("incluye CSP, HSTS, nosniff, anti-iframe, referrer y permisos", () => {
    const keys = securityHeaders({
      supabaseUrl: "https://abc.supabase.co",
      isDev: false,
    }).map((h) => h.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });
});
