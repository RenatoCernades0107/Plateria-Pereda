import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => "browser-client"),
  createServerClient: vi.fn(() => "server-client"),
  createSupabaseClient: vi.fn(() => "admin-client"),
  cookieStore: {
    getAll: vi.fn(() => [{ name: "sb", value: "1" }]),
    set: vi.fn(),
  },
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
  createServerClient: mocks.createServerClient,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createSupabaseClient,
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));

const URL = "http://127.0.0.1:54321";

describe("clientes de Supabase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "clave-publica-de-prueba",
    );
    vi.stubEnv("SUPABASE_SECRET_KEY", "clave-secreta-de-prueba");
    vi.stubEnv("APP_URL", "http://localhost:3000");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("el cliente del navegador usa la URL y la clave pública", async () => {
    const { createClient } = await import("./browser");
    expect(createClient()).toBe("browser-client");
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      URL,
      "clave-publica-de-prueba",
    );
  });

  it("el cliente del servidor lee y escribe las cookies de la petición", async () => {
    const { createClient } = await import("./server");
    expect(await createClient()).toBe("server-client");

    const calls = mocks.createServerClient.mock.calls as unknown as [
      string,
      string,
      { cookies: { getAll: () => unknown; setAll: (c: unknown[]) => void } },
    ][];
    const [url, key, options] = calls[0]!;
    expect([url, key]).toEqual([URL, "clave-publica-de-prueba"]);
    expect(options.cookies.getAll()).toEqual([{ name: "sb", value: "1" }]);

    options.cookies.setAll([
      { name: "sb", value: "2", options: { path: "/" } },
    ]);
    expect(mocks.cookieStore.set).toHaveBeenCalledWith("sb", "2", {
      path: "/",
    });
  });

  it("el cliente del servidor ignora el error al escribir cookies desde un Server Component", async () => {
    mocks.cookieStore.set.mockImplementationOnce(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler",
      );
    });
    const { createClient } = await import("./server");
    await createClient();
    const calls = mocks.createServerClient.mock.calls as unknown as [
      string,
      string,
      { cookies: { setAll: (c: unknown[]) => void } },
    ][];
    expect(() =>
      calls[0]![2].cookies.setAll([{ name: "sb", value: "2", options: {} }]),
    ).not.toThrow();
  });

  it("el cliente administrador usa la clave secreta y no guarda sesión", async () => {
    const { createAdminClient } = await import("./admin");
    expect(createAdminClient()).toBe("admin-client");
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      URL,
      "clave-secreta-de-prueba",
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
  });
});
