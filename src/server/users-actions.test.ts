import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const update = vi.fn();
  const maybeSingle = vi.fn();
  const remove = vi.fn();
  const restore = vi.fn();
  return {
    me: { id: "admin-1", role: "admin" },
    forbidden: false,
    update,
    maybeSingle,
    remove,
    restore,
    supabase: {
      from: vi.fn(() => ({
        update: (values: object) => ({
          eq: (_c: string, id: string) => update(values, id),
        }),
        select: () => ({ eq: () => ({ maybeSingle }) }),
        delete: () => ({
          eq: (_c: string, id: string) => ({
            select: async (columns: string) => remove(id, columns),
          }),
        }),
      })),
    },
    admin: {
      auth: {
        admin: {
          createUser: vi.fn(),
          updateUserById: vi.fn(),
          deleteUser: vi.fn(),
        },
      },
      from: (table: string) => ({
        insert: async (row: object) => restore(table, row),
      }),
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

const {
  createUser,
  deleteUser,
  setUserActive,
  setUserPassword,
  updateUserRole,
} = await import("./users-actions");

const perfil = {
  id: "u2",
  full_name: "Nora Nueva",
  email: "nora@pereda.test",
  role: "ventas",
  active: true,
  created_at: "2026-10-20T15:00:00Z",
};

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
    mocks.admin.auth.admin.deleteUser.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ data: [perfil], error: null });
    mocks.restore.mockResolvedValue({ error: null });
  });

  it("solo un administrador puede usarlas", async () => {
    mocks.forbidden = true;
    await expect(createUser(nuevo)).rejects.toThrow("FORBIDDEN");
    await expect(updateUserRole("u2", "ventas")).rejects.toThrow("FORBIDDEN");
    await expect(setUserActive("u2", false)).rejects.toThrow("FORBIDDEN");
    await expect(
      setUserPassword("u2", { password: "Clave-nueva-123" }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(deleteUser("u2")).rejects.toThrow("FORBIDDEN");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
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

  describe("deleteUser", () => {
    it("borra el perfil con la sesión del admin y luego el usuario de Auth", async () => {
      expect(await deleteUser("u2")).toEqual({ ok: true });
      expect(mocks.remove).toHaveBeenCalledWith(
        "u2",
        "id, full_name, email, role, active, created_at",
      );
      expect(mocks.admin.auth.admin.deleteUser).toHaveBeenCalledWith("u2");
      expect(mocks.restore).not.toHaveBeenCalled();
      // El perfil se borra antes que el usuario de Auth (queda a nombre del admin).
      expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
        Number(mocks.admin.auth.admin.deleteUser.mock.invocationCallOrder[0]),
      );
    });

    it("con actividad muestra el aviso de la BD y no toca Auth", async () => {
      const message =
        "“Nora Nueva” tiene actividad en el sistema (2 restauraciones y 1 pago). Desactívalo en su lugar.";
      mocks.remove.mockResolvedValue({
        data: null,
        error: { code: "23503", message },
      });
      expect(await deleteUser("u2")).toEqual({ error: message });
      expect(mocks.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it("el admin no se elimina a sí mismo", async () => {
      expect(await deleteUser("admin-1")).toEqual({
        error:
          "No puedes eliminarte a ti mismo: pídeselo a otro administrador.",
      });
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it("no revela otros errores y avisa si no se borró nada", async () => {
      mocks.remove.mockResolvedValue({
        data: null,
        error: { code: "XX000", message: "detalle interno" },
      });
      expect(await deleteUser("u2")).toEqual({
        error: "No se pudo eliminar el usuario.",
      });
      mocks.remove.mockResolvedValue({ data: [], error: null });
      expect(await deleteUser("u2")).toEqual({
        error: "No se pudo eliminar el usuario.",
      });
      expect(mocks.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it("si Auth falla restaura el perfil", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.admin.auth.admin.deleteUser.mockResolvedValue({
        error: { code: "unexpected_failure", status: 500 },
      });
      expect(await deleteUser("u2")).toEqual({
        error: "No se pudo eliminar el usuario. Intenta de nuevo.",
      });
      expect(mocks.restore).toHaveBeenCalledWith("profiles", perfil);
    });
  });
});
