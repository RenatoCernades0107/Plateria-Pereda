import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const update = vi.fn();
  const maybeSingle = vi.fn();
  return {
    me: { id: "admin-1", role: "admin" },
    forbidden: false,
    update,
    maybeSingle,
    supabase: {
      from: vi.fn(() => ({
        update: (values: object) => ({
          eq: (_c: string, id: string) => update(values, id),
        }),
        select: () => ({ eq: () => ({ maybeSingle }) }),
      })),
    },
    admin: {
      auth: {
        admin: { createUser: vi.fn(), updateUserById: vi.fn() },
      },
    },
  };
});

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return mocks.me;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.supabase,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.admin,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createUser, setUserActive, setUserPassword, updateUserRole } =
  await import("./users-actions");

const nuevo = {
  fullName: "Lola Logística",
  email: "lola@pereda.test",
  role: "logistica" as const,
  password: "Clave-de-lola-123",
};

describe("acciones de usuarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forbidden = false;
    mocks.update.mockResolvedValue({ error: null });
    mocks.admin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: "u-nuevo" } },
      error: null,
    });
    mocks.admin.auth.admin.updateUserById.mockResolvedValue({ error: null });
  });

  it("solo un administrador puede usarlas", async () => {
    mocks.forbidden = true;
    await expect(createUser(nuevo)).rejects.toThrow("FORBIDDEN");
    await expect(updateUserRole("u2", "ventas")).rejects.toThrow("FORBIDDEN");
    await expect(setUserActive("u2", false)).rejects.toThrow("FORBIDDEN");
    await expect(
      setUserPassword("u2", { password: "Clave-nueva-123" }),
    ).rejects.toThrow("FORBIDDEN");
  });

  describe("createUser", () => {
    it("crea el usuario con su contraseña y su rol, sin correo", async () => {
      expect(await createUser(nuevo)).toEqual({ ok: true });
      expect(mocks.admin.auth.admin.createUser).toHaveBeenCalledWith({
        email: "lola@pereda.test",
        password: "Clave-de-lola-123",
        email_confirm: true,
        user_metadata: { full_name: "Lola Logística" },
        app_metadata: { role: "logistica" },
      });
    });

    it("avisa si el email ya existe", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.admin.auth.admin.createUser.mockResolvedValue({
        data: {},
        error: { code: "email_exists" },
      });
      expect(await createUser(nuevo)).toEqual({
        error: "Ya existe un usuario con ese email.",
      });
    });

    it("avisa si la contraseña es débil", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.admin.auth.admin.createUser.mockResolvedValue({
        data: {},
        error: { code: "weak_password", status: 422 },
      });
      expect(await createUser(nuevo)).toEqual({
        error: "La contraseña es muy débil. Usa una más larga o genera una.",
      });
    });

    it("rechaza datos inválidos sin llamar a Supabase", async () => {
      expect(await createUser({ ...nuevo, email: "x" })).toEqual({
        error: "Revisa los datos ingresados.",
      });
      expect(await createUser({ ...nuevo, password: "corta" })).toEqual({
        error: "Revisa los datos ingresados.",
      });
      expect(mocks.admin.auth.admin.createUser).not.toHaveBeenCalled();
    });
  });

  describe("cambios sobre otro usuario", () => {
    it("cambia el rol", async () => {
      expect(await updateUserRole("u2", "ventas")).toEqual({ ok: true });
      expect(mocks.update).toHaveBeenCalledWith({ role: "ventas" }, "u2");
    });

    it("rechaza un rol inválido", async () => {
      expect(await updateUserRole("u2", "jefe" as never)).toEqual({
        error: "Elige un rol válido.",
      });
    });

    it("activa y desactiva", async () => {
      expect(await setUserActive("u2", false)).toEqual({ ok: true });
      expect(mocks.update).toHaveBeenCalledWith({ active: false }, "u2");
    });

    it("informa si la base de datos rechaza el cambio", async () => {
      mocks.update.mockResolvedValue({ error: { message: "rls" } });
      expect(await setUserActive("u2", true)).toEqual({
        error: "No se pudo actualizar el usuario.",
      });
      expect(await updateUserRole("u2", "ventas")).toEqual({
        error: "No se pudo cambiar el rol.",
      });
    });

    it("un administrador no puede cambiarse el rol ni desactivarse", async () => {
      const esperado = {
        error:
          "No puedes cambiar tu propio rol ni desactivarte: pídeselo a otro administrador.",
      };
      expect(await updateUserRole("admin-1", "ventas")).toEqual(esperado);
      expect(await setUserActive("admin-1", false)).toEqual(esperado);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe("setUserPassword", () => {
    it("cambia la contraseña del usuario", async () => {
      expect(
        await setUserPassword("u2", { password: "Clave-nueva-123" }),
      ).toEqual({ ok: true });
      expect(mocks.admin.auth.admin.updateUserById).toHaveBeenCalledWith("u2", {
        password: "Clave-nueva-123",
      });
    });

    it("rechaza una contraseña corta sin llamar a Supabase", async () => {
      expect(await setUserPassword("u2", { password: "corta" })).toEqual({
        error: "Revisa la contraseña ingresada.",
      });
      expect(mocks.admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("avisa si Supabase rechaza el cambio", async () => {
      mocks.admin.auth.admin.updateUserById.mockResolvedValue({
        error: { code: "weak_password" },
      });
      expect(
        await setUserPassword("u2", { password: "Clave-nueva-123" }),
      ).toEqual({
        error: "La contraseña es muy débil. Usa una más larga o genera una.",
      });
      mocks.admin.auth.admin.updateUserById.mockResolvedValue({
        error: { code: "unexpected_failure" },
      });
      expect(
        await setUserPassword("u2", { password: "Clave-nueva-123" }),
      ).toEqual({
        error: "No se pudo cambiar la contraseña. Intenta de nuevo.",
      });
    });
  });
});
