import { describe, expect, it } from "vitest";

import { isPublicPath, safeNextPath } from "./paths";

describe("isPublicPath", () => {
  it("reconoce las rutas públicas y sus subrutas", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/recuperar-contrasena")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
  });

  it("deja pasar los endpoints que se autentican solos", () => {
    expect(isPublicPath("/api/test/shopify")).toBe(true);
    expect(isPublicPath("/api/cron/shopify-sync")).toBe(true);
    expect(isPublicPath("/api/webhooks/shopify")).toBe(true);
    expect(isPublicPath("/api/otra-cosa")).toBe(false);
  });

  it("protege el resto, incluso rutas con prefijo parecido", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/restablecer-contrasena")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("acepta rutas internas con parámetros", () => {
    expect(safeNextPath("/clientes/42?tab=pagos")).toBe(
      "/clientes/42?tab=pagos",
    );
  });

  it("usa la raíz si no hay destino o no es interno", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://otro-sitio.com")).toBe("/");
    expect(safeNextPath("//otro-sitio.com")).toBe("/");
    expect(safeNextPath("/\\otro-sitio.com")).toBe("/");
  });
});
