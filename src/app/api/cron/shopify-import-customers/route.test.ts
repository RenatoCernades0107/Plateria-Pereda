import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: "s3creto-de-prueba-123" as string | undefined,
  run: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({ CRON_SECRET: mocks.secret }),
}));
vi.mock("@/server/clients/repository", () => ({
  importCustomerWithAdmin: vi.fn(),
}));
vi.mock("@/server/shopify", () => ({ getShopifyGateway: () => ({}) }));
vi.mock("@/server/clients/shopify-import", () => ({
  importShopifyCustomers: mocks.run,
}));

const { POST } = await import("./route");

const call = (authorization?: string, query = "") =>
  POST(
    new NextRequest(
      `http://localhost/api/cron/shopify-import-customers${query}`,
      { method: "POST", headers: authorization ? { authorization } : {} },
    ),
  );

describe("/api/cron/shopify-import-customers", () => {
  beforeEach(() => {
    mocks.secret = "s3creto-de-prueba-123";
    mocks.run.mockReset();
  });

  it("rechaza peticiones sin el secreto", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer otro")).status).toBe(401);
    mocks.secret = undefined;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("importa desde el cursor recibido y devuelve el resumen", async () => {
    mocks.run.mockResolvedValue({ created: 3, nextCursor: null });
    const response = await call("Bearer s3creto-de-prueba-123", "?after=abc");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: 3, nextCursor: null });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ after: "abc", deadline: expect.any(Number) }),
    );
  });

  it("si Shopify falla responde 502 con el cursor para reintentar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.run.mockRejectedValue(new Error("Shopify no responde"));
    const response = await call("Bearer s3creto-de-prueba-123", "?after=xyz");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ after: "xyz" });
  });
});
