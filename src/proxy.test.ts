import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

const session = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock("@/lib/supabase/proxy", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/supabase/proxy")>();
  return {
    ...original,
    updateSession: async () => {
      const response = NextResponse.next();
      response.cookies.set("sb-token", "renovado");
      return { response, isAuthenticated: session.isAuthenticated };
    },
  };
});

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy", () => {
  beforeEach(() => {
    session.isAuthenticated = false;
  });

  it("sin sesión redirige al login recordando la ruta pedida", async () => {
    const res = await proxy(request("/clientes/42?tab=pagos"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/clientes/42?tab=pagos");
    expect(res.cookies.get("sb-token")?.value).toBe("renovado");
  });

  it("sin sesión deja pasar las rutas públicas", async () => {
    const res = await proxy(request("/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("desde la raíz redirige al login sin parámetro next", async () => {
    const res = await proxy(request("/"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("con sesión, el login lleva al dashboard", async () => {
    session.isAuthenticated = true;
    const res = await proxy(request("/login"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("con sesión deja pasar las rutas protegidas", async () => {
    session.isAuthenticated = true;
    const res = await proxy(request("/clientes"));
    expect(res.headers.get("location")).toBeNull();
  });
});
