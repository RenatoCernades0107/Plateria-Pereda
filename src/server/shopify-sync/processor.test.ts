import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Json } from "@/lib/supabase/database.types";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import { FakeShopifyGateway } from "@/server/shopify/fake";

import { jobBackoffMs, type JobRepository, type SyncJob } from "./jobs";
import { processShopifyJobs } from "./processor";

const NOW = new Date("2026-10-03T12:00:00Z");

function memoryRepo(jobs: SyncJob[]) {
  const done: Record<
    number,
    {
      status: string;
      result?: Json | null;
      error?: string;
      retryAt?: Date | null;
    }
  > = {};
  const repo: JobRepository = {
    claim: vi.fn(async (limit: number) => jobs.splice(0, limit)),
    complete: vi.fn(async (id, result) => {
      done[id] = { status: "ok", result };
    }),
    fail: vi.fn(async (id, error, retryAt) => {
      done[id] = { status: retryAt ? "pending" : "error", error, retryAt };
    }),
  };
  return { repo, done };
}

const job = (
  id: number,
  kind: string,
  attempts = 1,
  maxAttempts = 8,
): SyncJob => ({
  id,
  kind,
  entityTable: "clients",
  entityId: `c${id}`,
  payload: { firstName: "Ana" },
  attempts,
  maxAttempts,
});

describe("procesador del outbox", () => {
  let gateway: FakeShopifyGateway;

  beforeEach(() => {
    gateway = new FakeShopifyGateway();
  });

  it("marca ok y guarda el resultado del handler", async () => {
    const { repo, done } = memoryRepo([job(1, "customer.create")]);
    const summary = await processShopifyJobs({
      repo,
      gateway,
      now: () => NOW,
      handlers: {
        "customer.create": async (j, g) => {
          const c = await g.createCustomer({
            firstName: (j.payload as { firstName: string }).firstName,
            lastName: "",
          });
          return { shopifyId: c.id };
        },
      },
    });
    expect(summary).toEqual({ processed: 1, ok: 1, retrying: 0, failed: 0 });
    expect(done[1]).toEqual({
      status: "ok",
      result: { shopifyId: expect.stringContaining("gid://shopify/Customer/") },
    });
  });

  it("un handler sin resultado guarda null", async () => {
    const { repo, done } = memoryRepo([job(1, "x.y")]);
    await processShopifyJobs({
      repo,
      gateway,
      handlers: { "x.y": async () => {} },
    });
    expect(done[1]).toEqual({ status: "ok", result: null });
  });

  it("un error que se puede reintentar espera con backoff", async () => {
    const { repo, done } = memoryRepo([job(1, "x.y", 3)]);
    const summary = await processShopifyJobs({
      repo,
      gateway,
      now: () => NOW,
      handlers: {
        "x.y": async () => {
          throw new ShopifyUnavailableError("Shopify no responde");
        },
      },
    });
    expect(summary.retrying).toBe(1);
    expect(done[1]).toEqual({
      status: "pending",
      error: "Shopify no responde",
      retryAt: new Date(NOW.getTime() + jobBackoffMs(3)),
    });
  });

  it("al llegar al máximo de intentos queda en error", async () => {
    const { repo, done } = memoryRepo([job(1, "x.y", 8, 8)]);
    const summary = await processShopifyJobs({
      repo,
      gateway,
      handlers: {
        "x.y": async () => {
          throw new Error("timeout de red");
        },
      },
    });
    expect(summary.failed).toBe(1);
    expect(done[1]).toMatchObject({ status: "error", retryAt: null });
  });

  it("un error que no se arregla reintentando queda en error de inmediato", async () => {
    const { repo, done } = memoryRepo([job(1, "x.y")]);
    await processShopifyJobs({
      repo,
      gateway,
      handlers: {
        "x.y": async () => {
          throw new ShopifyUserError([
            { field: ["email"], message: "Email is invalid" },
          ]);
        },
      },
    });
    expect(done[1]).toMatchObject({
      status: "error",
      error: "Email is invalid",
    });
  });

  it("un tipo de job desconocido queda en error", async () => {
    const { repo, done } = memoryRepo([job(1, "nada.raro")]);
    const summary = await processShopifyJobs({ repo, gateway, handlers: {} });
    expect(summary.failed).toBe(1);
    expect(done[1]?.error).toBe("Tipo de job desconocido: nada.raro");
  });

  it("sigue con los demás jobs si uno falla y respeta el tamaño de la tanda", async () => {
    const { repo, done } = memoryRepo([
      job(1, "falla"),
      job(2, "ok"),
      job(3, "ok"),
    ]);
    const summary = await processShopifyJobs({
      repo,
      gateway,
      batchSize: 2,
      handlers: {
        falla: async () => {
          throw new Error("x");
        },
        ok: async () => {},
      },
    });
    expect(repo.claim).toHaveBeenCalledWith(2);
    expect(summary).toEqual({ processed: 2, ok: 1, retrying: 1, failed: 0 });
    expect(Object.keys(done)).toEqual(["1", "2"]);
  });
});

describe("jobBackoffMs", () => {
  it("duplica la espera desde 30 s con tope de 1 hora", () => {
    expect([0, 1, 2, 3, 8, 20].map(jobBackoffMs)).toEqual([
      30_000, 30_000, 60_000, 120_000, 3_600_000, 3_600_000,
    ]);
  });
});
