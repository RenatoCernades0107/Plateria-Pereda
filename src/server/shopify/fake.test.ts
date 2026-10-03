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

  it("crea la orden con el adelanto: queda parcialmente pagada (flujo de P43)", async () => {
    const order = await createOrder();
    expect(order.name).toBe("#1001");
    expect(await shopify.getOrderFinancials(order.id)).toMatchObject({
      financialStatus: "PARTIALLY_PAID",
      total: "400.00",
      received: "200.00",
      outstanding: "200.00",
    });

    // El saldo completa la orden.
    expect(await shopify.recordFullPayment(order.id, "Efectivo")).toMatchObject(
      {
        financialStatus: "PAID",
        outstanding: "0.00",
      },
    );
    await expect(
      shopify.recordFullPayment(order.id, "Efectivo"),
    ).rejects.toThrow("Order is already paid");
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

  it("encuentra la orden por la etiqueta de la restauración", async () => {
    const order = await createOrder();
    expect((await shopify.findOrderByTag("RES-00001"))?.id).toBe(order.id);
    expect(await shopify.findOrderByTag("RES-99999")).toBeNull();
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

  it("edita la orden: quita una línea, cambia un precio y agrega otra", async () => {
    const order = await createOrder([]);
    const [first, second] = order.lines;
    const edited = await shopify.editOrder(order.id, {
      removeLineIds: [first!.id],
      setPrices: [{ lineId: second!.id, price: "300.00" }],
      addLines: [
        { title: "Restauración RES-00001-3", price: "50.00", quantity: 1 },
      ],
    });
    expect(edited.lines.map((l) => [l.title, l.price])).toEqual([
      ["Restauración RES-00001-2", "300.00"],
      ["Restauración RES-00001-3", "50.00"],
    ]);
    expect((await shopify.getOrderFinancials(order.id)).total).toBe("350.00");
    await expect(
      shopify.editOrder(order.id, { removeLineIds: ["gid://nada"] }),
    ).rejects.toBeInstanceOf(ShopifyUserError);
  });

  it("reembolsa un pago y marca líneas como preparadas", async () => {
    const order = await createOrder();
    expect(
      await shopify.refundPayment(order.id, {
        amount: "50.00",
        gateway: "Yape",
      }),
    ).toMatchObject({
      financialStatus: "PARTIALLY_REFUNDED",
      received: "150.00",
    });
    expect(
      await shopify.refundPayment(order.id, {
        amount: "150.00",
        gateway: "Yape",
      }),
    ).toMatchObject({ financialStatus: "REFUNDED", received: "0.00" });
    await expect(
      shopify.refundPayment(order.id, { amount: "1.00", gateway: "Yape" }),
    ).rejects.toThrow("Refund amount is invalid");

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
