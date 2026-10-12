import { describe, expect, it, vi } from "vitest";

import type { WebhookEvent } from "@/server/shopify-webhooks/types";

import {
  orderWebhookHandlers,
  type OrderWebhookRepository,
} from "./payment-webhooks";

const ORDER = "gid://shopify/Order/77";

function setup(restorationId: string | null = "r1") {
  const repo: OrderWebhookRepository = {
    findRestorationByOrder: vi.fn(async () => restorationId),
    enqueuePaymentSync: vi.fn(async () => {}),
    applyOrderCustomer: vi.fn(async () => true),
  };
  const processOutbox = vi.fn(async () => {});
  return {
    repo,
    processOutbox,
    handlers: orderWebhookHandlers(repo, processOutbox),
  };
}

const event = (topic: string, payload: object): WebhookEvent => ({
  id: 1,
  webhookId: "w1",
  topic,
  shopDomain: "pereda-fake.myshopify.com",
  payload: payload as WebhookEvent["payload"],
});

describe("webhooks de la orden (11.3)", () => {
  it.each([
    ["orders/paid", { admin_graphql_api_id: ORDER }],
    ["order_transactions/create", { order_id: 77 }],
    ["refunds/create", { order_id: 77 }],
  ])("%s encola la conciliación de la restauración", async (topic, payload) => {
    const { repo, processOutbox, handlers } = setup();
    await handlers[topic]!(event(topic, payload));
    expect(repo.findRestorationByOrder).toHaveBeenCalledWith(ORDER);
    expect(repo.enqueuePaymentSync).toHaveBeenCalledWith("r1");
    expect(processOutbox).toHaveBeenCalled();
    expect(repo.applyOrderCustomer).not.toHaveBeenCalled();
  });

  it("las órdenes que no son de restauraciones se ignoran", async () => {
    const { repo, processOutbox, handlers } = setup(null);
    await handlers["orders/paid"]!(event("orders/paid", { id: 77 }));
    expect(repo.enqueuePaymentSync).not.toHaveBeenCalled();
    expect(processOutbox).not.toHaveBeenCalled();
  });

  it("orders/updated también aplica el cambio de cliente (D31)", async () => {
    const { repo, handlers } = setup();
    await handlers["orders/updated"]!(
      event("orders/updated", {
        id: 77,
        customer: { id: 5, first_name: "Luis", last_name: "Rojas" },
      }),
    );
    expect(repo.applyOrderCustomer).toHaveBeenCalledWith("r1", {
      customerId: "gid://shopify/Customer/5",
      firstName: "Luis",
      lastName: "Rojas",
      email: null,
      phone: null,
    });
    expect(repo.enqueuePaymentSync).toHaveBeenCalledWith("r1");
  });

  it("sin id de orden el webhook queda en error", async () => {
    const { handlers } = setup();
    await expect(
      handlers["refunds/create"]!(event("refunds/create", {})),
    ).rejects.toThrow("no trae el id de la orden");
  });
});
