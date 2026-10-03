import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claims: null as object | null,
  cookiesToSet: [] as { name: string; value: string; options: object }[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          c: typeof mocks.cookiesToSet,
          h: Record<string, string>,
        ) => void;
      };
    },
  ) => ({
    auth: {
      getClaims: async () => {
        if (mocks.cookiesToSet.length) {
          options.cookies.setAll(mocks.cookiesToSet, {
            "cache-control": "private, no-store",
          });
        }
        return { data: mocks.claims ? { claims: mocks.claims } : null };
      },
    },
  }),
}));

const { redirectWithSession, updateSession } = await import("./proxy");

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "clave-publica-de-prueba",
    );
    mocks.claims = null;
    mocks.cookiesToSet = [];
  });

  it("sin claims no hay usuario autenticado", async () => {
    const { isAuthenticated } = await updateSession(
      new NextRequest("http://localhost:3000/"),
    );
    expect(isAuthenticated).toBe(false);
  });

  it("con claims renueva las cookies y marca la respuesta como no cacheable", async () => {
    mocks.claims = { sub: "u1" };
    mocks.cookiesToSet = [
      { name: "sb-token", value: "nuevo", options: { path: "/" } },
    ];
    const { response, isAuthenticated } = await updateSession(
      new NextRequest("http://localhost:3000/"),
    );
    expect(isAuthenticated).toBe(true);
    expect(response.cookies.get("sb-token")?.value).toBe("nuevo");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("redirectWithSession", () => {
  it("copia cookies y cabeceras de caché a la redirección", () => {
    const from = NextResponse.next();
    from.cookies.set("sb-token", "nuevo");
    from.headers.set("cache-control", "private, no-store");
    const res = redirectWithSession(
      new URL("http://localhost:3000/login"),
      from,
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
    expect(res.cookies.get("sb-token")?.value).toBe("nuevo");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
