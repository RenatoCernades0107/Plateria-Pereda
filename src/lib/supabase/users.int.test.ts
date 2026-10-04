import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "./admin";

const creados: string[] = [];

describe("usuarios creados con la API de administración", () => {
  afterAll(async () => {
    for (const id of creados)
      await createAdminClient().auth.admin.deleteUser(id);
  });

  it("el perfil toma el rol y el email aunque el rol se guarde después de crearlo", async () => {
    const admin = createAdminClient();
    const email = `int-${Date.now()}@pereda.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Prueba de integración" },
    });
    expect(error).toBeNull();
    creados.push(data.user!.id);

    await admin.auth.admin.updateUserById(data.user!.id, {
      app_metadata: { role: "ventas" },
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, role, active")
      .eq("id", data.user!.id)
      .single();
    expect(profile).toEqual({
      full_name: "Prueba de integración",
      email,
      role: "ventas",
      active: true,
    });
  });
});
