import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env.server";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

/**
 * Control del Shopify falso para los tests E2E: ver su estado, reiniciarlo o forzar
 * errores. Solo existe con SHOPIFY_MODE=fake.
 */
const notFound = () => new NextResponse(null, { status: 404 });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  // Pago (o reembolso, monto negativo) hecho directamente en el POS o el panel (11.3).
  z.object({
    action: z.literal("transaction"),
    tag: z.string(),
    amount: z.string(),
    gateway: z.string(),
  }),
  // Orden ya existente (p. ej., la orden de piezas de una guía antigua).
  z.object({
    action: z.literal("order"),
    input: z.object({
      customerId: z.string(),
      lines: z.array(
        z.object({
          title: z.string(),
          price: z.string(),
          quantity: z.number().int().positive(),
        }),
      ),
      tags: z.array(z.string()),
    }),
  }),
  // Crea un cliente que existe solo en Shopify (para probar el buscador e importaciones).
  z.object({
    action: z.literal("customer"),
    input: z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("fail"),
    method: z.enum([
      "createCustomer",
      "updateCustomer",
      "searchCustomers",
      "getCustomer",
      "createCompany",
      "createCompanyContact",
      "assignCustomerAsContact",
      "createOrder",
      "findOrderByTag",
      "getOrder",
      "getOrderFinancials",
      "editOrder",
      "recordFullPayment",
      "refundPayment",
      "fulfillLines",
      "searchProducts",
      "getProduct",
    ]),
    kind: z.enum(["unavailable", "user", "auth"]),
    message: z.string().optional(),
    /** Solo falla la llamada cuyos argumentos contienen este texto. */
    match: z.string().optional(),
  }),
]);

export async function GET() {
  if (serverEnv().SHOPIFY_MODE !== "fake") return notFound();
  return NextResponse.json(fakeShopify.snapshot());
}

export async function POST(request: NextRequest) {
  if (serverEnv().SHOPIFY_MODE !== "fake") return notFound();
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }
  const action = parsed.data;
  if (action.action === "reset") fakeShopify.reset();
  else if (action.action === "transaction") {
    const order = fakeShopify.externalTransaction(
      action.tag,
      action.amount,
      action.gateway,
    );
    return NextResponse.json({ ok: true, order });
  } else if (action.action === "order") {
    const order = await new FakeShopifyGateway().createOrder(action.input);
    return NextResponse.json({ ok: true, order });
  } else if (action.action === "customer") {
    const customer = await new FakeShopifyGateway().createCustomer(
      action.input,
    );
    return NextResponse.json({ ok: true, customer });
  } else
    fakeShopify.failNext(
      action.method,
      action.kind,
      action.message,
      action.match,
    );
  return NextResponse.json({ ok: true });
}
