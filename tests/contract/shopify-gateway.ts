import { beforeEach, describe, expect, it } from "vitest";

import { ShopifyUserError } from "@/server/shopify/errors";
import { fakeShopify } from "@/server/shopify/fake";
import type { ShopifyGateway } from "@/server/shopify/gateway";

/**
 * Contrato que cumplen los adaptadores `fake` y `live`: lo que el resto del sistema
 * puede esperar de Shopify, sin importar el adaptador.
 */
export function shopifyGatewayContract(
  name: string,
  make: () => ShopifyGateway,
) {
  describe(`contrato de ShopifyGateway (${name})`, () => {
    let gateway: ShopifyGateway;

    beforeEach(() => {
      fakeShopify.reset();
      gateway = make();
    });

    it("crea un cliente y lo lee por su id", async () => {
      const created = await gateway.createCustomer({
        firstName: "Ana",
        lastName: "Pérez",
        email: "ANA@correo.pe",
        phone: "+51999888777",
      });
      expect(created).toMatchObject({
        id: expect.stringMatching(/^gid:\/\/shopify\/Customer\//),
        displayName: "Ana Pérez",
        email: "ana@correo.pe",
        phone: "+51999888777",
      });
      expect(await gateway.getCustomer(created.id)).toEqual(created);
    });

    it("un cliente inexistente devuelve null", async () => {
      expect(await gateway.getCustomer("gid://shopify/Customer/1")).toBeNull();
    });

    it("rechaza un email inválido con un error tipado", async () => {
      const error = await gateway
        .createCustomer({ firstName: "Ana", lastName: "", email: "ana@" })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ShopifyUserError);
      expect((error as ShopifyUserError).fields[0]).toMatchObject({
        field: ["email"],
      });
    });

    it("rechaza un email duplicado", async () => {
      await gateway.createCustomer({
        firstName: "A",
        lastName: "",
        email: "a@b.pe",
      });
      await expect(
        gateway.createCustomer({
          firstName: "B",
          lastName: "",
          email: "a@b.pe",
        }),
      ).rejects.toBeInstanceOf(ShopifyUserError);
    });

    it("actualiza solo los campos enviados", async () => {
      const { id } = await gateway.createCustomer({
        firstName: "Ana",
        lastName: "Pérez",
        email: "ana@correo.pe",
      });
      const updated = await gateway.updateCustomer(id, {
        lastName: "Pérez Ruiz",
      });
      expect(updated).toMatchObject({
        displayName: "Ana Pérez Ruiz",
        email: "ana@correo.pe",
      });
    });

    it("busca clientes por nombre, email o teléfono, con paginación", async () => {
      for (const [i, name] of ["Ana", "Andrés", "Beatriz"].entries()) {
        await gateway.createCustomer({
          firstName: name,
          lastName: "Prueba",
          email: `cliente${i}@correo.pe`,
          phone: `+5199988877${i}`,
        });
      }
      const first = await gateway.searchCustomers("an", { first: 1 });
      expect(first.items.map((c) => c.firstName)).toEqual(["Ana"]);
      expect(first.pageInfo.hasNextPage).toBe(true);
      const second = await gateway.searchCustomers("an", {
        first: 1,
        after: first.pageInfo.endCursor,
      });
      expect(second.items.map((c) => c.firstName)).toEqual(["Andrés"]);
      expect(second.pageInfo.hasNextPage).toBe(false);

      expect(
        (await gateway.searchCustomers("cliente2@correo.pe")).items[0]
          ?.firstName,
      ).toBe("Beatriz");
      expect(
        (await gateway.searchCustomers("999888771")).items[0]?.firstName,
      ).toBe("Andrés");
    });

    it("busca productos y lee sus variantes", async () => {
      const page = await gateway.searchProducts("plata");
      expect(page.items.length).toBeGreaterThan(0);
      const fuente = page.items.find((p) => p.title.includes("Fuente"));
      expect(fuente).toMatchObject({
        minPrice: "1200.00",
        maxPrice: "1850.00",
      });

      const product = await gateway.getProduct(fuente!.id);
      expect(product?.variants.map((v) => v.price)).toEqual([
        "1200.00",
        "1850.00",
      ]);
      expect(await gateway.getProduct("gid://shopify/Product/1")).toBeNull();
    });

    describe("órdenes (validado en el spike 4.1)", () => {
      let customerId: string;

      beforeEach(async () => {
        customerId = (
          await gateway.createCustomer({ firstName: "Ana", lastName: "Pérez" })
        ).id;
      });

      const createOrder = (
        payments = [{ amount: "200.00", gateway: "Yape" }],
      ) =>
        gateway.createOrder({
          customerId,
          lines: [
            { title: "Restauración RES-00001-1", price: "150.00", quantity: 1 },
            { title: "Restauración RES-00001-2", price: "250.00", quantity: 1 },
          ],
          tags: ["RES-00001"],
          payments,
        });

      it("la orden con adelanto queda parcialmente pagada y el saldo la completa (P43)", async () => {
        const order = await createOrder();
        expect(order.lines.map((l) => [l.title, l.price, l.fulfilled])).toEqual(
          [
            ["Restauración RES-00001-1", "150.00", false],
            ["Restauración RES-00001-2", "250.00", false],
          ],
        );
        expect(await gateway.getOrderFinancials(order.id)).toMatchObject({
          financialStatus: "PARTIALLY_PAID",
          total: "400.00",
          received: "200.00",
          outstanding: "200.00",
        });
        expect(
          await gateway.recordFullPayment(order.id, "Efectivo"),
        ).toMatchObject({
          financialStatus: "PAID",
          received: "400.00",
          outstanding: "0.00",
        });
      });

      it("encuentra la orden por la etiqueta de la restauración", async () => {
        const order = await createOrder();
        expect((await gateway.findOrderByTag("RES-00001"))?.id).toBe(order.id);
        expect(await gateway.findOrderByTag("RES-99999")).toBeNull();
      });

      it("edita la orden: quita una pieza, cambia un precio y agrega otra", async () => {
        const order = await createOrder([]);
        const [first, second] = order.lines;
        const edited = await gateway.editOrder(order.id, {
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
        expect((await gateway.getOrderFinancials(order.id)).total).toBe(
          "350.00",
        );
      });

      it("marca piezas como preparadas (P44)", async () => {
        const order = await createOrder();
        const fulfilled = await gateway.fulfillLines(order.id, [
          order.lines[0]!.id,
        ]);
        expect(fulfilled.lines.map((l) => l.fulfilled)).toEqual([true, false]);
        await expect(
          gateway.fulfillLines(order.id, [order.lines[0]!.id]),
        ).rejects.toBeInstanceOf(ShopifyUserError);
      });

      it("reembolsa parte de un pago una sola vez por clave", async () => {
        const order = await createOrder();
        const refund = {
          amount: "50.00",
          gateway: "Yape",
          idempotencyKey: "refund:RES-00001-1",
        };
        expect(await gateway.refundPayment(order.id, refund)).toMatchObject({
          financialStatus: "PARTIALLY_REFUNDED",
          received: "150.00",
        });
        expect((await gateway.refundPayment(order.id, refund)).received).toBe(
          "150.00",
        );
      });
    });
  });
}
