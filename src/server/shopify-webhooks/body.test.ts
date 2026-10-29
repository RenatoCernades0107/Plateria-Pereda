import { describe, expect, it } from "vitest";

import { readBodyWithLimit } from "./body";

const post = (body: BodyInit, headers: HeadersInit = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

describe("readBodyWithLimit", () => {
  it("devuelve el cuerpo como texto (con tildes)", async () => {
    expect(await readBodyWithLimit(post('{"nombre":"Peña"}'), 100)).toBe(
      '{"nombre":"Peña"}',
    );
  });

  it("rechaza sin leer si el Content-Length declarado supera el límite", async () => {
    expect(
      await readBodyWithLimit(post("{}", { "content-length": "5000" }), 100),
    ).toBeNull();
  });

  it("corta un cuerpo que crece más allá del límite aunque no lo declare", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64));
      },
    });
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readBodyWithLimit(request, 1000)).toBeNull();
  });
});
