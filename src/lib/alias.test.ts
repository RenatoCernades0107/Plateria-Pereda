import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("alias @/*", () => {
  it("resuelve imports con el alias del proyecto", () => {
    expect(cn("a")).toBe("a");
  });
});
