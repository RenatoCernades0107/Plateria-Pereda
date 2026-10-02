import { describe, expect, it } from "vitest";

import { findNavItem } from "./navigation";

describe("findNavItem", () => {
  it("encuentra el módulo por ruta exacta o por subruta", () => {
    expect(findNavItem("/clientes")?.title).toBe("Clientes");
    expect(findNavItem("/clientes/42")?.title).toBe("Clientes");
  });

  it("no confunde rutas con prefijo parecido", () => {
    expect(findNavItem("/piezasx")).toBeUndefined();
    expect(findNavItem("/")).toBeUndefined();
  });
});
