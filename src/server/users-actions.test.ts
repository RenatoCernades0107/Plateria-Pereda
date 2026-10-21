import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const update = vi.fn();
  const maybeSingle = vi.fn();
  const remove = vi.fn();
  const restore = vi.fn();
  return {
    me: { id: "admin-1", role: "admin" },
    forbidden: false,
    origin: "http://localhost:3100" as string | null,
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
          inviteUserByEmail: vi.fn(),
          updateUserById: vi.fn(),
          deleteUser: vi.fn(),
        },
        resetPasswordForEmail: vi.fn(),
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
vi.mock("next/headers", () => ({
  headers: async () => new Map([["origin", mocks.origin]]),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({ APP_URL: "https://sistema.pereda.pe" }),
}));

const { createUser, deleteUser, resendAccess, setUserActive, updateUserRole } =
  await import("./users-actions");

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
};
const LINK = "http://localhost:3100/auth/confirm?next=/restablecer-contrasena";

describe("acciones de usuarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forbidden = false;
    mocks.update.mockResolvedValue({ error: null });
    mocks.admin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "u-nuevo" } },
      error: null,
    });
    mocks.admin.auth.admin.updateUserById.mockResolvedValue({ error: null });
    mocks.admin.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.admin.auth.admin.deleteUser.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ data: [perfil], error: null });
    mocks.restore.mockResolvedValue({ error: null });
  });

  it("solo un administrador puede usarlas", async () => {
    mocks.forbidden = true;
    await expect(createUser(nuevo)).rejects.toThrow("FORBIDDEN");
    await expect(updateUserRole("u2", "ventas")).rejects.toThrow("FORBIDDEN");
    await expect(setUserActive("u2", false)).rejects.toThrow("FORBIDDEN");
    await expect(resendAccess("u2")).rejects.toThrow("FORBIDDEN");
    await expect(deleteUser("u2")).rejects.toThrow("FORBIDDEN");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  describe("createUser", () => {
    it("invita por correo y asigna el rol", async () => {
      expect(await createUser(nuevo)).toEqual({ ok: true });
      expect(mocks.admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        "lola@pereda.test",
        {
          data: { full_name: "Lola Logística" },
          redirectTo: LINK,
        },
      );
      expect(mocks.admin.auth.admin.updateUserById).toHaveBeenCalledWith(
        "u-nuevo",
        {
          app_metadata: { role: "logistica" },
        },
      );
    });

    it("avisa si el email ya existe", async () => {
      mocks.admin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: {},
        error: { code: "email_exists" },
      });
      expect(await createUser(nuevo)).toEqual({
        error: "Ya existe un usuario con ese email.",
      });
    });

    it("avisa si se alcanzó el límite de correos", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.admin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: {},
        error: { code: "over_email_send_rate_limit", status: 429 },
      });
      expect(await createUser(nuevo)).toEqual({
        error:
          "Se alcanzó el límite de correos por hora. Espera un rato e intenta de nuevo.",
      });
    });

    it("avisa si no pudo asignar el rol", async () => {
      mocks.admin.auth.admin.updateUserById.mockResolvedValue({
        error: { code: "unexpected_failure" },
      });
      expect(await createUser(nuevo)).toEqual({
        error: "El usuario se creó, pero no se pudo asignar el rol.",
      });
    });

    it("rechaza datos inválidos sin llamar a Supabase", async () => {
      expect(await createUser({ ...nuevo, email: "x" })).toEqual({
        error: "Revisa los datos ingresados.",
      });
      expect(mocks.admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
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

  describe("resendAccess", () => {
    it("envía el enlace al email del perfil", async () => {
      mocks.maybeSingle.mockResolvedValue({
        data: { email: "lola@pereda.test" },
      });
      expect(await resendAccess("u2")).toEqual({ ok: true });
      expect(mocks.admin.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "lola@pereda.test",
        {
          redirectTo: LINK,
        },
      );
    });

    it("sin origin usa APP_URL", async () => {
      mocks.origin = null;
      mocks.maybeSingle.mockResolvedValue({
        data: { email: "lola@pereda.test" },
      });
      await resendAccess("u2");
      expect(mocks.admin.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "lola@pereda.test",
        {
          redirectTo:
            "https://sistema.pereda.pe/auth/confirm?next=/restablecer-contrasena",
        },
      );
      mocks.origin = "http://localhost:3100";
    });

    it("avisa si el usuario no tiene email o falla el envío", async () => {
      mocks.maybeSingle.mockResolvedValue({ data: null });
      expect(await resendAccess("u2")).toEqual({
        error: "El usuario no tiene email.",
      });
      mocks.maybeSingle.mockResolvedValue({
        data: { email: "lola@pereda.test" },
      });
      mocks.admin.auth.resetPasswordForEmail.mockResolvedValue({
        error: { code: "over_email_send_rate_limit" },
      });
      expect(await resendAccess("u2")).toEqual({
        error: "No se pudo enviar el correo. Intenta en unos minutos.",
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
