import { afterEach, describe, expect, it, vi } from "vitest";

import { formatLog, logger, sanitize } from "./logger";

const NOW = new Date("2026-10-29T15:00:00.000Z");
const parse = (line: string) => JSON.parse(line) as Record<string, unknown>;

describe("formatLog", () => {
  it("escribe una línea JSON con nivel, hora, mensaje y contexto", () => {
    expect(parse(formatLog("info", "Orden creada", { jobId: 7 }, NOW))).toEqual(
      {
        level: "info",
        time: "2026-10-29T15:00:00.000Z",
        msg: "Orden creada",
        jobId: 7,
      },
    );
  });

  it("no expone campos sensibles aunque vengan anidados", () => {
    const log = parse(
      formatLog(
        "error",
        "Fallo",
        {
          user: { id: "u1", email: "ana@pereda.pe", phone: "999888777" },
          headers: { authorization: "Bearer abc", cookie: "sb=1" },
          password: "Clave-123",
          SUPABASE_SECRET_KEY: "sb_secret_x",
          accessToken: "shpat_123",
          documentNumber: "12345678",
        },
        NOW,
      ),
    );
    expect(log.user).toEqual({
      id: "u1",
      email: "[oculto]",
      phone: "[oculto]",
    });
    expect(log.headers).toEqual({
      authorization: "[oculto]",
      cookie: "[oculto]",
    });
    expect(log.password).toBe("[oculto]");
    expect(log.SUPABASE_SECRET_KEY).toBe("[oculto]");
    expect(log.accessToken).toBe("[oculto]");
    expect(log.documentNumber).toBe("[oculto]");
  });

  it("tapa tokens, claves y emails dentro de textos y mensajes de error", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def_123";
    const line = formatLog(
      "error",
      `Token ${jwt} rechazado para ana@pereda.pe`,
      {
        detail: "clave sb_secret_AbC123 y shpat_9f8e7d inválidas",
        error: new Error("Authorization: Bearer abc.def.ghi falló"),
      },
      NOW,
    );
    expect(line).not.toContain(jwt);
    expect(line).not.toContain("ana@pereda.pe");
    expect(line).not.toContain("sb_secret_AbC123");
    expect(line).not.toContain("shpat_9f8e7d");
    expect(line).not.toContain("abc.def.ghi");
    expect(parse(line).msg).toBe("Token [oculto] rechazado para [oculto]");
  });
});

describe("sanitize", () => {
  it("serializa errores con código, digest y causa", () => {
    const error = Object.assign(new Error("No se pudo", { cause: "red" }), {
      code: "23505",
      digest: "123",
    });
    expect(sanitize(error)).toMatchObject({
      name: "Error",
      message: "No se pudo",
      code: "23505",
      digest: "123",
      cause: "red",
      stack: expect.stringContaining("Error: No se pudo"),
    });
  });

  it("corta estructuras muy profundas o con ciclos", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => JSON.stringify(sanitize(cyclic))).not.toThrow();
  });

  it("convierte fechas y bigint", () => {
    expect(sanitize({ at: NOW, n: BigInt(5) })).toEqual({
      at: "2026-10-29T15:00:00.000Z",
      n: "5",
    });
  });
});

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("los errores van a console.error y los avisos a console.warn", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.error("x", { a: 1 });
    logger.warn("y");
    expect(parse(error.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
      msg: "x",
      a: 1,
    });
    expect(parse(warn.mock.calls[0]![0] as string)).toMatchObject({
      level: "warn",
      msg: "y",
    });
  });
});
