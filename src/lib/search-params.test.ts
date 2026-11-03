import { describe, expect, it } from "vitest";

import { searchParamsRecord } from "./search-params";

describe("searchParamsRecord", () => {
  it("conserva los parámetros repetidos como lista", () => {
    expect(
      searchParamsRecord(
        new URLSearchParams("estado=lista&estado=completada&q=Ana"),
      ),
    ).toEqual({ estado: ["lista", "completada"], q: "Ana" });
  });

  it("sin parámetros, vacío", () => {
    expect(searchParamsRecord(new URLSearchParams())).toEqual({});
  });
});
