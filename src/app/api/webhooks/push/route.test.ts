import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: "s3creto-de-prueba-123" as string | undefined,
  dispatch: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  serverEnv: () => ({ CRON_SECRET: mocks.secret }),
}));
vi.mock("@/server/push/send", () => ({
  dispatchPendingPushes: mocks.dispatch,
}));

const { POST } = await import("./route");

const call = (authorization?: string) =>
  POST(
    new NextRequest("http://localhost/api/webhooks/push", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

describe("/api/webhooks/push", () => {
  beforeEach(() => {
    mocks.secret = "s3creto-de-prueba-123";
    mocks.dispatch.mockReset();
  });

  it("rechaza peticiones sin el secreto o con uno incorrecto", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer otro")).status).toBe(401);
    mocks.secret = undefined;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("envía las alertas pendientes", async () => {
    mocks.dispatch.mockResolvedValue({ alerts: 2, sent: 3, expired: 1 });
    const response = await call("Bearer s3creto-de-prueba-123");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alerts: 2, sent: 3, expired: 1 });
  });
});
