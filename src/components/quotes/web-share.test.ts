import { afterEach, describe, expect, it, vi } from "vitest";

import { canShareFiles } from "./web-share";

const file = new File(["%PDF-1.4"], "cotizacion.pdf", {
  type: "application/pdf",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canShareFiles", () => {
  it("sin navigator.share ni canShare (escritorio típico), no hay soporte", () => {
    expect(canShareFiles(file)).toBe(false);
  });

  it("con share pero sin canShare, no hay soporte (no se puede verificar el archivo)", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(canShareFiles(file)).toBe(false);
  });

  it("con canShare que rechaza el archivo, no hay soporte", () => {
    vi.stubGlobal("navigator", {
      share: vi.fn(),
      canShare: vi.fn(() => false),
    });
    expect(canShareFiles(file)).toBe(false);
  });

  it("con share y canShare que acepta el archivo (celular), hay soporte", () => {
    const canShare = vi.fn(() => true);
    vi.stubGlobal("navigator", { share: vi.fn(), canShare });
    expect(canShareFiles(file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });
});
