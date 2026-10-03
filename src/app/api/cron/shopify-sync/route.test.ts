import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: "s3creto-de-prueba-123" as string | undefined,
  run: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({ CRON_SECRET: mocks.secret }),
}));
vi.mock("@/server/shopify-sync/run", () => ({ runShopifySync: mocks.run }));

const { GET } = await import("./route");

const call = (authorization?: string) =>
  GET(
    new NextRequest("http://localhost/api/cron/shopify-sync", {
      headers: authorization ? { authorization } : {},
    }),
  );

const summary = (processed: number) => ({
  processed,
  ok: processed,
  retrying: 0,
  failed: 0,
});

describe("/api/cron/shopify-sync", () => {
  beforeEach(() => {
    mocks.secret = "s3creto-de-prueba-123";
    mocks.run.mockReset();
  });

  it("rechaza peticiones sin el secreto o con uno incorrecto", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer otro")).status).toBe(401);
    expect((await call("s3creto-de-prueba-123")).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado no se ejecuta nunca", async () => {
    mocks.secret = undefined;
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("procesa tandas hasta vaciar el outbox y suma los resultados", async () => {
    mocks.run
      .mockResolvedValueOnce(summary(10))
      .mockResolvedValueOnce(summary(3))
      .mockResolvedValueOnce(summary(0));
    const response = await call("Bearer s3creto-de-prueba-123");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 13,
      ok: 13,
      retrying: 0,
      failed: 0,
    });
    expect(mocks.run).toHaveBeenCalledTimes(3);
  });

  it("procesa como máximo 5 tandas por llamada", async () => {
    mocks.run.mockResolvedValue(summary(10));
    await call("Bearer s3creto-de-prueba-123");
    expect(mocks.run).toHaveBeenCalledTimes(5);
  });
});
