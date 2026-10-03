import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, redirectMock } from "../../tests/support/fake-supabase";

const mocks = vi.hoisted(() => ({
  supabase: null as unknown as ReturnType<
    typeof import("../../tests/support/fake-supabase").fakeSupabase
  >,
  redirect: null as unknown as ReturnType<
    typeof import("../../tests/support/fake-supabase").redirectMock
  >,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.supabase,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const { getAuthState, requireUser } = await import("./auth");

describe("sesión del usuario", () => {
  beforeEach(() => {
    mocks.redirect = redirectMock();
  });

  it("sin sesión es anónimo y requireUser lleva al login", async () => {
    mocks.supabase = fakeSupabase({ user: null });
    expect(await getAuthState()).toEqual({ status: "anonimo" });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("un perfil desactivado lleva a cerrar la sesión", async () => {
    mocks.supabase = fakeSupabase({
      user: { id: "u1" },
      profile: { active: false },
    });
    expect(await getAuthState()).toEqual({ status: "inactivo" });
    await expect(requireUser()).rejects.toThrow(
      "REDIRECT:/auth/salir?motivo=inactivo",
    );
  });

  it("un usuario sin perfil se trata como desactivado", async () => {
    mocks.supabase = fakeSupabase({ user: { id: "u1" }, profile: null });
    expect(await getAuthState()).toEqual({ status: "inactivo" });
  });

  it("un usuario activo devuelve sus datos", async () => {
    mocks.supabase = fakeSupabase({
      user: { id: "u1", email: "ventas@pereda.test" },
      profile: { full_name: "Vera Ventas", role: "ventas", active: true },
    });
    expect(await requireUser()).toEqual({
      id: "u1",
      email: "ventas@pereda.test",
      fullName: "Vera Ventas",
      role: "ventas",
    });
  });
});
