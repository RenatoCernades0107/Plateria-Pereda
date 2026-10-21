import { expect, test } from "./fixtures";
import { ensureCatalogItem } from "./support/catalog";
import { adminClient, userClient } from "./support/supabase";
import { SEED_PASSWORD, SEED_USERS } from "./support/users";

// Cambian la configuración de las alertas (global): en serie.
test.describe.configure({ mode: "serial" });

/** Guía normal de prueba con piezas en el estado indicado (sin pasar por la app). */
async function seedRestoration(statuses: string[]) {
  const admin = adminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("kind", "persona")
    .limit(1)
    .single();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({ client_id: client!.id, payment_type: "credito" })
    .select("id, code")
    .single();
  if (error) throw error;
  const ids: string[] = [];
  for (const [i, status] of statuses.entries()) {
    const { data: piece, error: pieceError } = await admin
      .from("pieces")
      .insert({
        restoration_id: r.id,
        description: `Pieza alerta ${i + 1}`,
        service_name: "Limpieza",
        price: 10,
      } as never)
      .select("id")
      .single();
    if (pieceError) throw pieceError;
    if (status !== "registrada") {
      await admin
        .from("pieces")
        .update({ status } as never)
        .eq("id", piece!.id);
    }
    ids.push(piece!.id);
  }
  return { ...(r as { id: string; code: string }), pieceIds: ids };
}

async function changeStatusAs(
  role: "ventas" | "logistica",
  ids: string[],
  to: "aprobada" | "en_espera",
) {
  const client = await userClient(SEED_USERS[role].email, SEED_PASSWORD);
  const { error } = await client.rpc("change_piece_status", {
    p_piece_ids: ids,
    p_to: to,
  });
  if (error) throw error;
}

test.describe("Alertas", () => {
  test.beforeAll(async () => {
    await ensureCatalogItem("services", "Limpieza");
  });

  test("logística recibe en vivo la aprobación parcial y abre la guía", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
    const guide = await seedRestoration(["registrada", "registrada"]);
    await loginAs("logistica");
    await page.goto("/piezas");
    const bell = page.getByRole("button", { name: /^Alertas/ });
    await expect(bell).toBeVisible();

    await changeStatusAs("ventas", [guide.pieceIds[0]!], "aprobada");

    // Llega sola (Realtime), con su aviso.
    await expect(
      page.getByText(`${guide.code} · Guía parcialmente aprobada`).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(bell).toHaveAccessibleName(/Alertas, \d+ sin leer/);

    await bell.click();
    const item = page
      .getByRole("dialog")
      .getByRole("link", { name: new RegExp(guide.code) })
      .first();
    await expect(item).toContainText("Van 1 de 2 piezas aprobadas");
    await expect(item).toContainText("Ventas de prueba aprobó");

    const results = await makeAxeBuilder().include("[role=dialog]").analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);

    await item.click();
    await expect(page).toHaveURL(new RegExp(`/restauraciones/${guide.id}`));
  });

  test("el admin personaliza el mensaje y silencia a un usuario", async ({
    page,
    loginAs,
  }) => {
    const admin = adminClient();
    const { data: original } = await admin.from("alert_settings").select("*");
    try {
      await loginAs("admin");
      await page.goto("/configuracion/alertas");

      const pieza = page.getByRole("region", {
        name: "Pieza en espera del cliente",
      });
      const message = pieza.getByLabel("Mensaje");
      await message.fill("Seguimiento pendiente: ");
      await pieza.getByRole("button", { name: /Insertar \{piezas\}/ }).click();
      await expect(pieza.getByText("Vista previa")).toBeVisible();
      await expect(
        pieza.getByText(/Seguimiento pendiente: RES-00124-1/),
      ).toBeVisible();

      // Logística no recibirá la de guía aprobada.
      const total = page.getByRole("region", { name: "Guía aprobada" });
      await total.getByLabel(/Logística de prueba/).uncheck();

      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByText("Alertas guardadas.")).toBeVisible();
      await page.reload();
      await expect(message).toHaveValue(/^Seguimiento pendiente: \{piezas\}/);
      await expect(total.getByLabel(/Logística de prueba/)).not.toBeChecked();

      // Logística pasa una pieza a espera: el admin ve el mensaje propio.
      const guide = await seedRestoration(["en_consulta", "en_consulta"]);
      await changeStatusAs("logistica", [guide.pieceIds[0]!], "en_espera");
      await page.goto("/dashboard");
      await page.getByRole("button", { name: /^Alertas/ }).click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("link", { name: new RegExp(guide.code) })
          .first(),
      ).toContainText(`Seguimiento pendiente: ${guide.code}-1`);

      // Ventas aprueba todo una guía: logística (silenciada) no recibe "Guía aprobada".
      const approved = await seedRestoration(["registrada"]);
      await changeStatusAs("ventas", approved.pieceIds, "aprobada");
      const { data: logistica } = await admin
        .from("profiles")
        .select("id")
        .eq("email", SEED_USERS.logistica.email)
        .single();
      const { count } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("restoration_id", approved.id)
        .eq("recipient_id", logistica!.id);
      expect(count).toBe(0);
    } finally {
      for (const row of original ?? []) {
        await admin.from("alert_settings").update(row).eq("id", row.id);
      }
    }
  });
});
