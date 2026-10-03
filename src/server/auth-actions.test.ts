import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, redirectMock } from "../../tests/support/fake-supabase";

const mocks = vi.hoisted(() => ({
  supabase: null as unknown as ReturnType<
    typeof import("../../tests/support/fake-supabase").fakeSupabase
  >,
  redirect: null as unknown as ReturnType<
    typeof import("../../tests/support/fake-supabase").redirectMock
  >,
  origin: "http://localhost:3100" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.supabase,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["origin", mocks.origin]]),
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({ APP_URL: "https://sistema.pereda.pe" }),
}));

const { login, logout, requestPasswordReset, resetPassword } =
  await import("./auth-actions");

const credenciales = { email: "ventas@pereda.test", password: "secreta" };

describe("acciones de autenticación", () => {
  beforeEach(() => {
    mocks.supabase = fakeSupabase({ profile: { active: true } });
    mocks.redirect = redirectMock();
    mocks.origin = "http://localhost:3100";
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

  describe("requestPasswordReset", () => {
    it("envía el enlace de vuelta al mismo servidor", async () => {
      expect(
        await requestPasswordReset({ email: "Ventas@Pereda.test" }),
      ).toEqual({ ok: true });
      expect(mocks.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "ventas@pereda.test",
        {
          redirectTo:
            "http://localhost:3100/auth/confirm?next=/restablecer-contrasena",
        },
      );
    });

    it("sin cabecera origin usa APP_URL", async () => {
      mocks.origin = null;
      await requestPasswordReset({ email: "ventas@pereda.test" });
      expect(mocks.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "ventas@pereda.test",
        {
          redirectTo:
            "https://sistema.pereda.pe/auth/confirm?next=/restablecer-contrasena",
        },
      );
    });

    it("valida el email", async () => {
      expect(await requestPasswordReset({ email: "x" })).toEqual({
        error: "Ingresa un email válido.",
      });
    });
  });

  describe("resetPassword", () => {
    const datos = {
      password: "Clave-nueva-1",
      confirmPassword: "Clave-nueva-1",
    };

    it("guarda la contraseña y entra al sistema", async () => {
      await expect(resetPassword(datos)).rejects.toThrow("REDIRECT:/");
      expect(mocks.supabase.auth.updateUser).toHaveBeenCalledWith({
        password: "Clave-nueva-1",
      });
    });

    it("explica si la contraseña es igual a la anterior", async () => {
      mocks.supabase.auth.updateUser.mockResolvedValue({
        error: { code: "same_password" },
      });
      expect(await resetPassword(datos)).toEqual({
        error: "La nueva contraseña debe ser distinta de la anterior.",
      });
    });

    it("pide un enlace nuevo ante otros errores", async () => {
      mocks.supabase.auth.updateUser.mockResolvedValue({
        error: { code: "session_expired" },
      });
      expect(await resetPassword(datos)).toEqual({
        error: "No se pudo cambiar la contraseña. Pide un nuevo enlace.",
      });
    });

    it("valida la confirmación", async () => {
      expect(
        await resetPassword({
          password: "Clave-nueva-1",
          confirmPassword: "otra",
        }),
      ).toEqual({
        error: "Revisa la contraseña ingresada.",
      });
    });
  });
});
