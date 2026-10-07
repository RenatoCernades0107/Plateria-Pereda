import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { restorationSchema } from "@/lib/validation/restorations";

import { createRestorationRecord } from "./create";

const RUN = `${Date.now()}`.slice(-8);
const created: { clients: string[]; restorations: string[] } = {
  clients: [],
  restorations: [],
};

async function signIn(email: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "Pereda-local-2026",
  });
  if (error) throw error;
  return client;
}

describe("registro de restauraciones", () => {
  afterAll(async () => {
    const admin = createAdminClient();
    await admin
      .from("pieces")
      .delete()
      .in("restoration_id", created.restorations);
    await admin.from("restorations").delete().in("id", created.restorations);
    await admin.from("clients").delete().in("id", created.clients);
  });

  it("la acción guarda la restauración y sus piezas, auditadas", async () => {
    const admin = createAdminClient();
    const { data: client } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: "Restauración",
        last_name: RUN,
        shopify_customer_id: `gid://shopify/Customer/7${RUN}`,
      })
      .select("id")
      .single();
    created.clients.push(client!.id);

    const input = restorationSchema.parse({
      clientId: client!.id,
      contactId: null,
      paymentType: "a_cuenta",
      depositPercent: "50",
      notes: "Prueba de integración",
      pieces: [
        {
          workshopId: null,
          description: "Fuente ovalada",
          measure: "40 cm",
          material: { id: null, name: "Plata 950" },
          service: { id: null, name: "Limpieza" },
          weight: "820.5",
          price: "0.10",
          notes: "",
        },
        {
          workshopId: null,
          description: "Bandeja",
          measure: "",
          material: { id: null, name: "" },
          service: { id: null, name: "" },
          weight: "",
          price: "0.20",
          notes: "",
        },
      ],
    });

    const ventas = await signIn("ventas@pereda.test");
    const result = await createRestorationRecord(ventas, input);
    created.restorations.push(result.id);
    expect(result.code).toMatch(/^RES-\d{5,}$/);

    const { data: restoration } = await ventas
      .from("restorations")
      .select(
        "total, expected_deposit, notes, pieces(id, code, material_name, price, location)",
      )
      .eq("id", result.id)
      .single();
    expect(restoration).toMatchObject({
      total: 0.3,
      expected_deposit: 0.15,
      notes: "Prueba de integración",
    });
    const pieces = restoration!.pieces.sort((a, b) =>
      a.code.localeCompare(b.code),
    );
    expect(pieces.map(({ id, ...rest }) => (id ? rest : null))).toEqual([
      {
        code: `${result.code}-1`,
        material_name: "Plata 950",
        price: 0.1,
        // Las piezas de oficina nacen en la tienda, sin enviar al taller (P48).
        location: "sin_enviar",
      },
      {
        code: `${result.code}-2`,
        material_name: "",
        price: 0.2,
        location: "sin_enviar",
      },
    ]);

    const { count } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("table_name", "pieces")
      .eq("action", "insert")
      .in(
        "record_id",
        pieces.map((p) => p.id),
      );
    expect(count).toBe(2);
  });

  it("logística no puede registrar", async () => {
    const logistica = await signIn("logistica@pereda.test");
    await expect(
      createRestorationRecord(logistica, {
        clientId: created.clients[0]!,
        contactId: null,
        paymentType: "contado",
        depositPercent: null,
        notes: "",
        pieces: [],
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
