import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Fotos y archivos de la restauración (Fase 10, P32).
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientIds: string[] = [];
const restorationIds: string[] = [];

// PNG de 1×1 y un PDF mínimo: alcanzan para subir y mostrar.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

async function seedRestoration(name: string) {
  const admin = adminClient();
  const { data: client, error } = await admin
    .from("clients")
    .insert({ kind: "persona", first_name: name, last_name: "E2E" })
    .select("id")
    .single();
  if (error) throw error;
  clientIds.push(client.id);
  const { data: r, error: rError } = await admin
    .from("restorations")
    .insert({ client_id: client.id, payment_type: "contado" })
    .select("id, code")
    .single();
  if (rError) throw rError;
  restorationIds.push(r.id);
  const { error: pieceError } = await admin.from("pieces").insert({
    restoration_id: r.id,
    description: "Fuente",
    price: 10,
  } as never);
  if (pieceError) throw pieceError;
  return r;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

async function openFiles(page: Page, id: string) {
  await page.goto(`/restauraciones/${id}`);
  await page.getByRole("tab", { name: /Archivos/ }).click();
}

test.describe("Fotos y archivos", () => {
  test.afterAll(async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("restoration_files")
      .select("path")
      .in("restoration_id", restorationIds);
    if (data?.length)
      await admin.storage
        .from("restoration-files")
        .remove(data.map((f) => f.path));
    await admin.from("pieces").delete().in("restoration_id", restorationIds);
    await admin.from("restorations").delete().in("id", restorationIds);
    await admin.from("clients").delete().in("id", clientIds);
  });

  test("ventas sube 2 fotos «Antes» y un PDF a una pieza, los ve, compara y borra", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration(`Fotos${run}`);
    await loginAs("ventas");
    await openFiles(page, r.id);
    await expect(page.getByText("Aún no hay fotos ni archivos.")).toBeVisible();

    await choose(page, "Para", `${r.code}-1 · Fuente`);
    await page
      .getByLabel("Archivos a subir")
      .setInputFiles([png("antes-1.png"), png("antes-2.png")]);
    await expect(page.getByText("2 archivos subidos.")).toBeVisible();

    await choose(page, "Clasificación", "Documento");
    await page.getByLabel("Archivos a subir").setInputFiles({
      name: "guia.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await expect(page.getByText("Archivo subido.")).toBeVisible();

    const piece = page.getByRole("region", { name: `${r.code}-1 · Fuente` });
    await expect(piece.getByRole("group", { name: "Antes (2)" })).toBeVisible();
    await expect(piece.getByRole("list", { name: "Archivos" })).toContainText(
      "guia.pdf",
    );
    await expect(page.getByRole("tab", { name: "Archivos (3)" })).toBeVisible();

    // Con una foto «Después» se puede comparar.
    await choose(page, "Clasificación", "Después");
    await page.getByLabel("Archivos a subir").setInputFiles(png("despues.png"));
    await expect(page.getByText("Archivo subido.").first()).toBeVisible();
    await piece
      .getByRole("button", { name: "Comparar antes y después" })
      .click();
    const compare = page.getByRole("dialog");
    await expect(compare.getByText("Antes", { exact: true })).toBeVisible();
    await expect(compare.getByText("Después", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    // Visor con descarga; quien lo subió lo puede borrar.
    await piece.getByRole("button", { name: "Ver guia.pdf" }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByRole("link", { name: "Descargar" })).toBeVisible();
    await viewer.getByRole("button", { name: "Borrar" }).click();
    await viewer.getByRole("button", { name: "Confirmar: borrar" }).click();
    await expect(page.getByText("Archivo borrado.")).toBeVisible();
    await expect(piece.getByRole("list", { name: "Archivos" })).toHaveCount(0);
  });

  test("en el detalle de la pieza el destino es fijo, la foto se ve al lado y se borra", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration(`Pieza${run}`);
    const { data: piece } = await adminClient()
      .from("pieces")
      .select("id")
      .eq("restoration_id", r.id)
      .single();
    await loginAs("ventas");
    await page.goto(`/piezas/${piece!.id}`);
    await expect(page.getByText("La pieza aún no tiene fotos.")).toBeVisible();

    // "Para" no se elige: es esta pieza.
    await expect(page.getByTestId("archivo-destino-fijo")).toHaveText(
      `${r.code}-1 · Fuente`,
    );
    await expect(page.getByRole("combobox", { name: "Para" })).toHaveCount(0);

    await page.getByLabel("Archivos a subir").setInputFiles(png("pieza.png"));
    await expect(page.getByText("Archivo subido.")).toBeVisible();
    const thumb = page.getByRole("button", { name: "Ver pieza.png" });
    await expect(thumb).toBeVisible();

    // Al pulsarla se ve en grande.
    await thumb.click();
    await expect(
      page.getByRole("dialog").getByRole("img", { name: "pieza.png" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Borrar desde la miniatura pide confirmación.
    await page.getByRole("button", { name: "Borrar pieza.png" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sí, borrar" })
      .click();
    await expect(page.getByText("Archivo borrado.")).toBeVisible();
    await expect(page.getByText("La pieza aún no tiene fotos.")).toBeVisible();
  });

  test("un archivo no permitido muestra el error y no se sube", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await openFiles(page, restorationIds[0]!);
    await page.getByLabel("Archivos a subir").setInputFiles({
      name: "planilla.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("x"),
    });
    await expect(
      page
        .getByRole("region", { name: "Subir fotos y archivos" })
        .getByRole("alert"),
    ).toContainText(
      "«planilla.xlsx»: solo se aceptan fotos (JPG, PNG, WebP, HEIC) y PDF.",
    );
    await expect(page.getByTestId("subida")).toHaveCount(0);
  });

  test("logística sube una foto general y una «Antes» de la pieza; no borra lo ajeno", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration(`Logis${run}`);
    await loginAs("logistica");
    await openFiles(page, r.id);

    await page.getByLabel("Archivos a subir").setInputFiles(png("general.png"));
    await expect(page.getByText("Archivo subido.")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "General (todas las piezas)" })
        .getByRole("button", { name: "Ver general.png" }),
    ).toBeVisible();

    await choose(page, "Para", `${r.code}-1 · Fuente`);
    await page.getByLabel("Archivos a subir").setInputFiles(png("pieza.png"));
    const piece = page.getByRole("region", { name: `${r.code}-1 · Fuente` });
    await expect(
      piece.getByRole("button", { name: "Ver pieza.png" }),
    ).toBeVisible();

    // Un archivo que subió ventas (en la primera restauración): logística no lo borra.
    await openFiles(page, restorationIds[0]!);
    await page.getByRole("button", { name: "Ver antes-1.png" }).click();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Borrar" }),
    ).toHaveCount(0);
  });

  test("subir una foto desde el celular @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const r = await seedRestoration(`Movil${run}`);
    await loginAs("logistica");
    await openFiles(page, r.id);
    await expect(
      page.getByRole("button", { name: "Tomar foto" }),
    ).toBeVisible();
    await page
      .getByLabel("Foto con la cámara")
      .setInputFiles(png("camara.png"));
    await expect(page.getByText("Archivo subido.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ver camara.png" }),
    ).toBeVisible();
  });
});
