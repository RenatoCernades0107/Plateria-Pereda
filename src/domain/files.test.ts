import { describe, expect, it } from "vitest";

import {
  fileError,
  fileMimeType,
  filePath,
  formatFileSize,
  groupByCategory,
  isCompressible,
  MAX_FILE_BYTES,
  scaledSize,
} from "./files";

const file = (name: string, type: string, size = 1000) => ({
  name,
  type,
  size,
});

describe("archivos (Fase 10, P32)", () => {
  it("acepta fotos JPG, PNG, WebP, HEIC y PDF", () => {
    for (const [name, type] of [
      ["a.jpg", "image/jpeg"],
      ["a.png", "image/png"],
      ["a.webp", "image/webp"],
      ["a.heic", "image/heic"],
      ["a.pdf", "application/pdf"],
    ]) {
      expect(fileError(file(name!, type!))).toBeNull();
    }
  });

  it("reconoce HEIC por la extensión si el navegador no informa el tipo", () => {
    expect(fileMimeType(file("IMG_1.HEIC", ""))).toBe("image/heic");
    expect(fileMimeType(file("guia.pdf", "application/octet-stream"))).toBe(
      "application/pdf",
    );
  });

  it("rechaza otros tipos, archivos vacíos y los de más de 10 MB", () => {
    expect(fileError(file("virus.exe", "application/x-msdownload"))).toMatch(
      /solo se aceptan/,
    );
    expect(fileError(file("doc.docx", ""))).toMatch(/solo se aceptan/);
    expect(fileError(file("a.jpg", "image/jpeg", 0))).toMatch(/vacío/);
    expect(
      fileError(file("grande.jpg", "image/jpeg", MAX_FILE_BYTES + 1)),
    ).toMatch(/10 MB/);
    expect(
      fileError(file("justo.jpg", "image/jpeg", MAX_FILE_BYTES)),
    ).toBeNull();
  });

  it("la compresión se aplica solo a JPG, PNG y WebP", () => {
    expect(isCompressible("image/jpeg")).toBe(true);
    expect(isCompressible("image/png")).toBe(true);
    expect(isCompressible("image/webp")).toBe(true);
    expect(isCompressible("image/heic")).toBe(false);
    expect(isCompressible("application/pdf")).toBe(false);
  });

  it("reduce el lado mayor a 1920 px manteniendo la proporción", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1920, height: 1440 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1440, height: 1920 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("arma la ruta general o de la pieza", () => {
    expect(filePath("r1", null, "f1", "image/jpeg")).toBe(
      "restorations/r1/general/f1.jpg",
    );
    expect(filePath("r1", "p1", "f2", "application/pdf")).toBe(
      "restorations/r1/pieces/p1/f2.pdf",
    );
  });

  it("agrupa por clasificación en el orden Antes, Después, Documento, Otro", () => {
    const files = [
      { id: 1, category: "otro" as const },
      { id: 2, category: "antes" as const },
      { id: 3, category: "despues" as const },
      { id: 4, category: "antes" as const },
    ];
    expect(
      groupByCategory(files).map((g) => [g.category, g.files.map((f) => f.id)]),
    ).toEqual([
      ["antes", [2, 4]],
      ["despues", [3]],
      ["otro", [1]],
    ]);
  });

  it("muestra el tamaño en KB o MB", () => {
    expect(formatFileSize(350 * 1024)).toBe("350 KB");
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe("1,3 MB");
  });
});
