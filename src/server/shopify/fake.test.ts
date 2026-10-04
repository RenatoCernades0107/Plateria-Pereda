import { beforeEach, describe, expect, it } from "vitest";

import { shopifyGatewayContract } from "../../../tests/contract/shopify-gateway";
import {
  ShopifyAuthError,
  ShopifyNotFoundError,
  ShopifyUnavailableError,
  ShopifyUserError,
} from "./errors";
import { FakeShopifyGateway, fakeShopify } from "./fake";

shopifyGatewayContract("fake", () => new FakeShopifyGateway());

describe("Shopify falso: órdenes y pagos", () => {
  let shopify: FakeShopifyGateway;
  let customerId: string;

  beforeEach(async () => {
    fakeShopify.reset();
    shopify = new FakeShopifyGateway();
    customerId = (
      await shopify.createCustomer({ firstName: "Ana", lastName: "Pérez" })
    ).id;
  });

  const createOrder = (payments = [{ amount: "200.00", gateway: "Yape" }]) =>
    shopify.createOrder({
      customerId,
      lines: [
        { title: "Restauración RES-00001-1", price: "150.00", quantity: 1 },
        { title: "Restauración RES-00001-2", price: "250.00", quantity: 1 },
      ],
      tags: ["RES-00001"],
      payments,
    });

  it("sin pagos la orden queda pendiente; no se aceptan pagos mayores al total", async () => {
    const order = await createOrder([]);
    expect((await shopify.getOrderFinancials(order.id)).financialStatus).toBe(
      "PENDING",
    );
    await expect(
      createOrder([{ amount: "500.00", gateway: "Yape" }]),
    ).rejects.toBeInstanceOf(ShopifyUserError);
  });

  it("valida el cliente y las líneas al crear la orden", async () => {
    await expect(
      shopify.createOrder({ customerId: "gid://x", lines: [], tags: [] }),
    ).rejects.toThrow("Customer does not exist");
    await expect(
      shopify.createOrder({ customerId, lines: [], tags: [] }),
    ).rejects.toThrow("Line items can't be blank");
    await expect(
      shopify.createOrder({
        customerId,
        lines: [{ title: "x", price: "10.00", quantity: 0 }],
        tags: [],
      }),
    ).rejects.toThrow("Quantity must be at least 1");
  });

  it("reembolsa hasta lo cobrado y valida las líneas a preparar", async () => {
    const order = await createOrder();
    const refund = (amount: string, idempotencyKey: string) =>
      shopify.refundPayment(order.id, {
        amount,
        gateway: "Yape",
        idempotencyKey,
      });
    expect(await refund("200.00", "r1")).toMatchObject({
      financialStatus: "REFUNDED",
      received: "0.00",
    });
    await expect(refund("1.00", "r2")).rejects.toThrow(
      "Refund amount is invalid",
    );

    const fulfilled = await shopify.fulfillLines(order.id, [
      order.lines[0]!.id,
    ]);
    expect(fulfilled.lines.map((l) => l.fulfilled)).toEqual([true, false]);
    await expect(
      shopify.fulfillLines(order.id, ["gid://nada"]),
    ).rejects.toThrow("not found");
  });

  it("una orden inexistente da error de no encontrado", async () => {
    await expect(
      shopify.getOrderFinancials("gid://nada"),
    ).rejects.toBeInstanceOf(ShopifyNotFoundError);
    await expect(
      shopify.updateCustomer("gid://nada", { firstName: "x" }),
    ).rejects.toBeInstanceOf(ShopifyNotFoundError);
  });

  it("un cliente necesita nombre, email o teléfono; valida el teléfono", async () => {
    await expect(
      shopify.createCustomer({ firstName: "", lastName: "" }),
    ).rejects.toThrow("must have a name");
    await expect(
      shopify.createCustomer({ firstName: "A", lastName: "", phone: "999" }),
    ).rejects.toThrow("Phone is invalid");
    await shopify.createCustomer({
      firstName: "A",
      lastName: "",
      phone: "+51999000111",
    });
    await expect(
      shopify.createCustomer({
        firstName: "B",
        lastName: "",
        phone: "+51999000111",
      }),
    ).rejects.toThrow("Phone has already been taken");
    const soloEmail = await shopify.createCustomer({
      firstName: "",
      lastName: "",
      email: "solo@correo.pe",
    });
    expect(soloEmail.displayName).toBe("solo@correo.pe");
  });

  it("permite forzar errores y registra las llamadas", async () => {
    fakeShopify.failNext("createOrder", "unavailable");
    fakeShopify.failNext("createOrder", "auth");
    fakeShopify.failNext("getCustomer", "user", "Algo salió mal");
    await expect(createOrder()).rejects.toBeInstanceOf(ShopifyUnavailableError);
    await expect(createOrder()).rejects.toBeInstanceOf(ShopifyAuthError);
    await expect(shopify.getCustomer(customerId)).rejects.toThrow(
      "Algo salió mal",
    );
    await expect(createOrder()).resolves.toBeDefined();

    const snapshot = fakeShopify.snapshot();
    expect(
      snapshot.calls.filter((c) => c.method === "createOrder"),
    ).toHaveLength(3);
    expect(snapshot.orders[0]?.financials.financialStatus).toBe(
      "PARTIALLY_PAID",
    );
    expect(snapshot.customers).toHaveLength(1);
  });
});
