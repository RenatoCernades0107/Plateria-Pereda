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
  });
}
