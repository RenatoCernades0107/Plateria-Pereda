import { describe, expect, it } from "vitest";

import { safeEqual } from "./secrets";

describe("safeEqual", () => {
  it("compara secretos", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
