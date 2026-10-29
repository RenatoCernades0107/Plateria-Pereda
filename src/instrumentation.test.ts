import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestError, register } from "./instrumentation";

describe("register", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("impide arrancar el servidor si el entorno es inválido", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => register()).toThrow("Variables de entorno inválidas");
  });

  it("no valida en el runtime edge", () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => register()).not.toThrow();
  });
});

describe("onRequestError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registra el error con su digest y la ruta, sin query ni cabeceras", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("Falló la consulta"), {
      digest: "4242",
    });
    await onRequestError(
      error,
      {
        path: "/clientes?q=ana@pereda.pe",
        method: "GET",
        headers: { cookie: "sb-access-token=secreto" },
      },
      {
        routerKind: "App Router",
        routePath: "/(app)/clientes",
        routeType: "render",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      },
    );
    const line = spy.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toMatchObject({
      level: "error",
      digest: "4242",
      method: "GET",
      path: "/clientes",
      route: "/(app)/clientes",
      routeType: "render",
      error: { message: "Falló la consulta" },
    });
    expect(line).not.toContain("secreto");
    expect(line).not.toContain("ana@pereda.pe");
  });
});
