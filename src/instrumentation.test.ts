import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "./instrumentation";

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
