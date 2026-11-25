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

  test("el resumen separa lo aprobado de lo que aún está por aprobar (foto de hoy)", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?${RANGE}`);
    const group = page.getByTestId("antes-y-despues-de-aprobar");
    await expect(group).toBeVisible();
    // La guía R2 (admin) sigue Registrada con su pieza sin aprobar; R1 ya está aprobada.
    for (const key of [
      "kpi-guias-antes",
      "kpi-guias-aprobadas",
      "kpi-piezas-antes",
      "kpi-piezas-aprobadas",
    ]) {
      await expect(page.getByTestId(`${key}-valor`)).toHaveText(/\d/);
    }
    await expect(
      page.getByTestId("kpi-guias-antes").getByRole("link"),
    ).toHaveAttribute("href", /\/restauraciones\?estado=registrada/);
    await expect(
      page.getByTestId("kpi-piezas-antes").getByRole("link"),
    ).toHaveAttribute("href", /estado=en_consulta/);
  });

  test("cada cifra y gráfico dice qué tiempo toma: periodo, hoy o estado actual", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?${RANGE}`);
    await expect(page.getByTestId("rango-leyenda")).toBeVisible();
    const scopeOf = (testId: string) =>
      page.getByTestId(testId).getByTestId("scope");

    // Por fecha de evento dentro del rango (cerrado: no dice «hasta hoy»).
    for (const id of ["kpi-cobrado", "kpi-vendido", "grafico-ventas"]) {
      await expect(scopeOf(id)).toHaveAttribute("data-scope", "periodo");
      await expect(scopeOf(id)).toContainText("1 mar – 31 mar 2024");
      await expect(scopeOf(id)).not.toContainText("hasta hoy");
    }
    // Foto de hoy: no depende del rango elegido.
    for (const id of ["kpi-saldo", "kpi-guias-antes", "requiere-atencion"]) {
      await expect(scopeOf(id).first()).toHaveAttribute("data-scope", "hoy");
      await expect(scopeOf(id).first()).toContainText("Al día de hoy");
      await expect(scopeOf(id).first()).not.toContainText("2024");
    }
    // Registrado en el rango, con el estado de hoy.
    await expect(scopeOf("kpi-conversion")).toHaveAttribute(
      "data-scope",
      "cohorte",
    );
    await expect(scopeOf("kpi-conversion")).toContainText("estado actual");

    await page.goto(`/dashboard?area=pedidos&${RANGE}`);
    await expect(scopeOf("panel-estados")).toHaveAttribute(
      "data-scope",
      "cohorte",
    );
    await expect(scopeOf("panel-embudo")).toHaveAttribute(
      "data-scope",
      "cohorte",
    );
    await expect(scopeOf("panel-ubicacion")).toHaveAttribute(
      "data-scope",
      "hoy",
    );
    await expect(scopeOf("kpi-en-curso")).toHaveAttribute("data-scope", "hoy");
    await expect(scopeOf("panel-cumplimiento")).toHaveAttribute(
      "data-scope",
      "periodo",
    );

    // Un atajo que termina hoy lo dice.
    await page.goto("/dashboard?area=ventas&rango=7d");
    await expect(scopeOf("kpi-cobrado")).toContainText("hasta hoy");
    await expect(scopeOf("kpi-saldo")).not.toContainText("hasta hoy");
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
    // «Vendido según tipo de pago» ya no está.
    await expect(page.getByTestId("panel-cobranza")).not.toContainText(
      "tipo de pago",
    );

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
    // Junto al monto, cuántos pagos fueron.
    await expect(page.getByTestId("panel-metodos")).toContainText("1 pago");
    await expect(page.getByTestId("panel-servicios")).toBeVisible();
    await expect(page.getByTestId("panel-materiales")).toBeVisible();
    await expect(page.getByTestId("panel-margen")).toContainText("S/ 60");
    await page
      .getByTestId("grafico-vendido-cobrado")
      .getByTestId("ver-como-tabla")
      .click();
    const table = page.getByTestId("grafico-tabla");
    await expect(table).toContainText("S/ 100");
    await expect(table).toContainText("S/ 50");
  });

  test("ventas: las listas por cobrar reemplazan al margen y llevan a la lista filtrada", async ({
    page,
    loginAs,
  }) => {
    for (const role of ["admin", "ventas"] as const) {
      await loginAs(role);
      await page.goto(`/dashboard?area=ventas&${RANGE}`);
      await expect(page.getByTestId("kpi-margen")).toHaveCount(0);
      await expect(page.getByTestId("kpi-listas-piezas-valor")).toHaveText(
        /\d/,
      );
      await expect(page.getByTestId("kpi-listas-guias-valor")).toHaveText(/\d/);
      // Piezas: solo cantidad (sin monto); guías: cantidad y su saldo.
      await expect(page.getByTestId("kpi-listas-piezas")).not.toContainText(
        "S/",
      );
      await expect(page.getByTestId("kpi-listas-guias")).toContainText("S/");
      await expect(
        page.getByTestId("kpi-listas-piezas").getByRole("link"),
      ).toHaveAttribute("href", /\/piezas\?.*porcobrar=1/);
      await expect(
        page.getByTestId("kpi-listas-guias").getByRole("link"),
      ).toHaveAttribute("href", /estado=lista.*pago=pendiente.*pago=parcial/);
    }
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
    // En consulta y En espera del cliente son barras separadas.
    await expect(page.getByTestId("panel-embudo")).toContainText("En consulta");
    await expect(page.getByTestId("panel-embudo")).toContainText(
      "En espera de respuesta del cliente",
    );
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
    expect(csv).toContain("Efectivo,100,1");
    expect(csv).toContain("Método,Cobrado (S/),Pagos");
    expect(csv).not.toContain("tipo de pago");
  });

  test("la pestaña vieja «cotizaciones» abre Whatsapp y Corporativo tiene su CSV", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(`/dashboard?area=cotizaciones&${RANGE}`);
    await expect(page.getByTestId("pestana-whatsapp")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("pestana-cotizaciones")).toHaveCount(0);
    await expect(page.getByTestId("panel-cwa")).toBeVisible();
    await expect(page.getByTestId("panel-origen")).toBeVisible();
    await expect(page.getByTestId("panel-cot")).toHaveCount(0);

    await page.goto(`/dashboard?area=corporativo&${RANGE}`);
    await expect(page.getByTestId("pestana-corporativo")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("kpi-cot")).toBeVisible();
    await expect(page.getByTestId("panel-cot")).toBeVisible();
    await expect(page.getByTestId("panel-cwa")).toHaveCount(0);

    const response = await page.request.get(
      "/api/dashboard/exportar?area=corporativo&desde=2024-03-01&hasta=2024-03-31",
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain(
      "dashboard-corporativo-2024-03-01_2024-03-31.csv",
    );
    expect(await response.text()).toContain("Dashboard · Corporativo");
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
      "whatsapp",
      "corporativo",
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
