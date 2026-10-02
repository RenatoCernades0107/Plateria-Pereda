import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("une clases e ignora valores vacíos", () => {
    expect(cn("p-2", false, null, undefined, "text-sm")).toBe("p-2 text-sm");
  });

  it("aplica clases condicionales", () => {
    expect(cn("base", { activo: true, inactivo: false })).toBe("base activo");
  });

  it("resuelve conflictos de Tailwind quedándose con la última clase", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
