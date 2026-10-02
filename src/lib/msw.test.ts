import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../tests/msw/server";

describe("MSW", () => {
  it("responde con el handler registrado en el test", async () => {
    server.use(
      http.get("https://api.ejemplo.test/ping", () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const res = await fetch("https://api.ejemplo.test/ping");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rechaza peticiones sin handler en lugar de salir a la red", async () => {
    await expect(
      fetch("https://api.ejemplo.test/sin-handler"),
    ).rejects.toThrow();
  });
});
