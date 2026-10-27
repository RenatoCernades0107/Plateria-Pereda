import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Dashboard de métricas (Fase 13). Los datos van en marzo de 2024, un rango que ninguna otra
// prueba toca, así las cifras son exactas aunque el resto de la suite corra en paralelo.
const RANGE = "rango=custom&desde=2024-03-01&hasta=2024-03-31";
const ADMIN_ID = "10000000-0000-0000-0000-000000000001";
const VENTAS_ID = "10000000-0000-0000-0000-000000000002";
const run = Date.now().toString(36);
const clientName = `Dash${run}`;

const ids = { client: "", r1: "", r2: "", p1: "", p2: "", p3: "" };

test.describe("Dashboard", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const admin = adminClient();
    const insert = async <T extends { id: string }>(
      table: "clients" | "restorations" | "pieces",
      row: Record<string, unknown>,
    ) => {
      const { data, error } = await admin
        .from(table)
        .insert(row as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as unknown as T).id;
    };

    ids.client = await insert("clients", {
      kind: "persona",
      first_name: clientName,
      last_name: "Metricas",
      region: "ARE",
      created_at: "2024-03-05T15:00:00Z",
    });
    // R1 (ventas): dos piezas aprobadas = S/ 150. R2 (admin): una pieza sin aprobar.
    ids.r1 = await insert("restorations", {
      client_id: ids.client,
      payment_type: "contado",
      created_by: VENTAS_ID,
      created_at: "2024-03-10T15:00:00Z",
    });
    ids.r2 = await insert("restorations", {
      client_id: ids.client,
      payment_type: "contado",
      created_by: ADMIN_ID,
      created_at: "2024-03-20T15:00:00Z",
    });
    ids.p1 = await insert("pieces", {
      restoration_id: ids.r1,
      description: "Fuente métricas",
      price: 100,
      service_cost: 40,
      created_at: "2024-03-10T15:00:00Z",
    });
    ids.p2 = await insert("pieces", {
      restoration_id: ids.r1,
      description: "Bandeja métricas",
      price: 50,
      created_at: "2024-03-10T15:00:00Z",
    });
    ids.p3 = await insert("pieces", {
      restoration_id: ids.r2,
      description: "Jarra métricas",
      price: 30,
      created_at: "2024-03-20T15:00:00Z",
    });
    for (const [id, when] of [
      [ids.p1, "2024-03-11T17:00:00Z"],
      [ids.p2, "2024-03-12T17:00:00Z"],
    ] as const) {
      const { error } = await admin
        .from("pieces")
        .update({ status: "aprobada", approved_at: when } as never)
        .eq("id", id);
      if (error) throw error;
    }
    const { error } = await admin.from("payments").insert({
      restoration_id: ids.r1,
      kind: "pago",
      amount: 100,
      method_name: "Efectivo",
      paid_on: "2024-03-12",
      created_by_name: "E2E",
    } as never);
    if (error) throw error;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    const restorations = [ids.r1, ids.r2];
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", restorations);
    await admin.from("payments").delete().in("restoration_id", restorations);
    await admin.from("pieces").delete().in("restoration_id", restorations);
    await admin.from("restorations").delete().in("id", restorations);
    await admin.from("clients").delete().eq("id", ids.client);
  });

  test("el resumen muestra las cifras del rango, el margen del admin y las frases @smoke", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?${RANGE}`);
    await expect(page.getByTestId("rango-texto")).toContainText(
      "1 mar – 31 mar 2024",
    );
    await expect(page.getByTestId("kpi-vendido-valor")).toHaveText("S/ 150");
    await expect(page.getByTestId("kpi-cobrado-valor")).toHaveText("S/ 100");
    await expect(page.getByTestId("kpi-guias-valor")).toHaveText("2");
    await expect(page.getByTestId("kpi-ticket-valor")).toHaveText("S/ 150");
    await expect(page.getByTestId("kpi-clientes-nuevos-valor")).toHaveText("1");
    await expect(page.getByTestId("insight-margen")).toContainText("S/ 60");
    await expect(page.getByTestId("insights")).toContainText(
      "Cobraste el 67 % de lo que vendiste",
    );
    // Lo de siempre sigue ahí: los pendientes con enlace al listado.
    await expect(page.getByTestId("requiere-atencion")).toBeVisible();
    await expect(page.getByTestId("pendiente-urgentes")).toBeVisible();
  });

  test("cambiar el rango actualiza las métricas y la URL", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/dashboard?area=ventas");
    await page.getByTestId("rango-personalizado").click();
    await page.getByTestId("rango-desde").fill("2024-03-01");
    await page.getByTestId("rango-hasta").fill("2024-03-31");
    await page.getByTestId("rango-aplicar").click();
    await expect(page).toHaveURL(
      /rango=custom&desde=2024-03-01&hasta=2024-03-31/,
    );
    await expect(page.getByTestId("kpi-vendido-valor")).toHaveText("S/ 150");
    await expect(page.getByTestId("medidor-cobranza")).toContainText("67 %");

    await page.getByTestId("rango-hoy").click();
    await expect(page).toHaveURL(/rango=hoy/);
    await expect(page.getByTestId("rango-hoy")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByTestId("rango-texto")).not.toContainText("2024");
  });

  test("ventas: cobrado por método, el gráfico se puede ver como tabla", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?area=ventas&${RANGE}`);
    await expect(page.getByTestId("panel-metodos")).toContainText("Efectivo");
    await expect(page.getByTestId("panel-metodos")).toContainText("S/ 100");
    await expect(page.getByTestId("panel-margen")).toContainText("S/ 60");
    await page
      .getByTestId("grafico-vendido-cobrado")
      .getByTestId("ver-como-tabla")
      .click();
    const table = page.getByTestId("grafico-tabla");
    await expect(table).toContainText("S/ 100");
    await expect(table).toContainText("S/ 50");
  });

  test("clientes y pedidos muestran lo registrado", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?area=clientes&${RANGE}`);
    await expect(page.getByTestId("panel-mejores-clientes")).toContainText(
      `${clientName} Metricas`,
    );
    await expect(page.getByTestId("panel-regiones")).toContainText("Arequipa");
    await page.goto(`/dashboard?area=pedidos&${RANGE}`);
    await expect(page.getByTestId("kpi-guias-valor")).toHaveText("2");
    await expect(page.getByTestId("panel-estados")).toBeVisible();
    await expect(page.getByTestId("panel-embudo")).toContainText("Registradas");
  });

  test("el admin ve a todos los vendedores; ventas solo su desempeño y sin márgenes", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?area=vendedores&${RANGE}`);
    await expect(page.getByTestId(`vendedor-${VENTAS_ID}`)).toBeVisible();
    await expect(page.getByTestId(`vendedor-${ADMIN_ID}`)).toBeVisible();
    await expect(page.getByTestId("pestana-vendedores")).toHaveText(
      "Vendedores",
    );
  });

  test("ventas ve su propio desempeño y ningún costo ni margen", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await page.goto(`/dashboard?area=vendedores&${RANGE}`);
    await expect(page.getByTestId("pestana-vendedores")).toHaveText(
      "Mi desempeño",
    );
    await expect(page.getByTestId(`vendedor-${VENTAS_ID}`)).toBeVisible();
    await expect(page.getByTestId(`vendedor-${ADMIN_ID}`)).toHaveCount(0);
    await expect(page.getByTestId("panel-ranking")).toHaveCount(0);

    await page.goto(`/dashboard?${RANGE}`);
    await expect(page.getByTestId("kpi-vendido-valor")).toHaveText("S/ 150");
    await expect(page.getByTestId("insight-margen")).toHaveCount(0);
    await page.goto(`/dashboard?area=ventas&${RANGE}`);
    await expect(page.getByTestId("panel-margen")).toHaveCount(0);
    await expect(page.getByTestId("kpi-margen")).toHaveCount(0);
    await page.goto(`/dashboard?area=talleres&${RANGE}`);
    await expect(page.getByTestId("tabla-talleres")).not.toContainText("Costo");
  });

  test("exporta el CSV de la pestaña con el rango", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    const response = await page.request.get(
      "/api/dashboard/exportar?area=ventas&desde=2024-03-01&hasta=2024-03-31",
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain(
      "dashboard-ventas-2024-03-01_2024-03-31.csv",
    );
    const csv = await response.text();
    expect(csv).toContain("Vendido (S/),150");
    expect(csv).toContain("Efectivo,100");
  });

  test("sin sesión no se obtiene el CSV", async ({ request }) => {
    const response = await request.get("/api/dashboard/exportar", {
      maxRedirects: 0,
    });
    expect([302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()["content-type"] ?? "").not.toContain("text/csv");
  });

  test("logística no puede exportar", async ({ page, loginAs }) => {
    await loginAs("logistica");
    const response = await page.request.get("/api/dashboard/exportar");
    expect(response.status()).toBe(403);
  });

  test("cada pestaña carga sin errores ni violaciones graves de accesibilidad", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await loginAs("admin");
    for (const area of [
      "resumen",
      "ventas",
      "pedidos",
      "clientes",
      "talleres",
      "vendedores",
      "cotizaciones",
    ]) {
      await page.goto(`/dashboard?area=${area}&${RANGE}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeVisible();
      await expect(page.getByTestId(`pestana-${area}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      const { violations } = await makeAxeBuilder().analyze();
      expect(
        violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        ),
        `accesibilidad en ${area}`,
      ).toEqual([]);
    }
    // En el celular nada ensancha la página.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

// Sin datos propios: solo que en el celular las pestañas carguen, no ensanchen la página y
// no tengan violaciones graves (las tablas pasan a tarjetas).
test.describe("Dashboard en el celular @mobile", () => {
  test("las pestañas caben en la pantalla y son accesibles", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
    await loginAs("admin");
    for (const area of ["resumen", "ventas", "talleres", "vendedores"]) {
      await page.goto(`/dashboard?area=${area}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeVisible();
      const { violations } = await makeAxeBuilder().analyze();
      expect(
        violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        ),
        `accesibilidad en ${area}`,
      ).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `desborde en ${area}`).toBeLessThanOrEqual(0);
    }
  });
});
