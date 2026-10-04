import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  requeue: vi.fn(),
  schedule: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "ventas" };
  },
}));
vi.mock("./repository", () => ({ requeueJob: mocks.requeue }));
vi.mock("./run", () => ({ scheduleShopifySync: mocks.schedule }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const { retryShopifyJob } = await import("./actions");

describe("retryShopifyJob", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.requeue, mocks.schedule, mocks.revalidate])
      fn.mockReset();
    mocks.requeue.mockResolvedValue(true);
  });

  it("vuelve a encolar el job, lo procesa enseguida y refresca la página", async () => {
    expect(await retryShopifyJob(7, "/clientes/1")).toEqual({ ok: true });
    expect(mocks.requeue).toHaveBeenCalledWith(7);
    expect(mocks.schedule).toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/clientes/1");
  });

  it("no refresca rutas externas", async () => {
    await retryShopifyJob(7, "https://otro.sitio");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rechaza ids inválidos y jobs que ya no se pueden reintentar", async () => {
    expect(await retryShopifyJob(0)).toEqual({
      error: "Sincronización inválida.",
    });
    mocks.requeue.mockResolvedValue(false);
    expect(await retryShopifyJob(7)).toEqual({
      error: "Esta sincronización ya no se puede reintentar.",
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("exige permiso", async () => {
    mocks.forbidden = true;
    await expect(retryShopifyJob(7)).rejects.toThrow("FORBIDDEN");
  });
});
