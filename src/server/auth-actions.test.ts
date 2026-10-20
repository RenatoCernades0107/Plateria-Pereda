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

const { login, logout } = await import("./auth-actions");

const credenciales = { email: "ventas@pereda.test", password: "secreta" };

describe("acciones de autenticación", () => {
  beforeEach(() => {
    mocks.supabase = fakeSupabase({ profile: { active: true } });
    mocks.redirect = redirectMock();
  });

  describe("login", () => {
    it("con credenciales válidas redirige al destino seguro", async () => {
      mocks.supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "u1" } },
        error: null,
      });
      await expect(login(credenciales, "/clientes")).rejects.toThrow(
        "REDIRECT:/clientes",
      );
      await expect(
        login(credenciales, "https://malicioso.com"),
      ).rejects.toThrow("REDIRECT:/");
    });

    it("traduce las credenciales incorrectas", async () => {
      mocks.supabase.auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { code: "invalid_credentials" },
      });
      expect(await login(credenciales)).toEqual({
        error: "Email o contraseña incorrectos.",
      });
    });

    it("muestra un error genérico ante otros fallos", async () => {
      mocks.supabase.auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { code: "over_request_rate_limit" },
      });
      expect(await login(credenciales)).toEqual({
        error: "No se pudo iniciar sesión. Intenta de nuevo en unos minutos.",
      });
    });

    it("rechaza a un usuario desactivado y cierra su sesión", async () => {
      mocks.supabase = fakeSupabase({ profile: { active: false } });
      mocks.supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "u1" } },
        error: null,
      });
      expect(await login(credenciales)).toEqual({
        error: "Tu usuario está desactivado. Habla con el administrador.",
      });
      expect(mocks.supabase.auth.signOut).toHaveBeenCalled();
    });

    it("no llama a Supabase con datos inválidos", async () => {
      expect(await login({ email: "x", password: "" })).toEqual({
        error: "Revisa los datos ingresados.",
      });
      expect(mocks.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });
  });

  it("logout cierra solo la sesión de este dispositivo", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.supabase.auth.signOut).toHaveBeenCalledWith({
      scope: "local",
    });
  });
});
