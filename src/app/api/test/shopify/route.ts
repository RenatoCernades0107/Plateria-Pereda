import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env.server";
import { fakeShopify } from "@/server/shopify/fake";

/**
 * Control del Shopify falso para los tests E2E: ver su estado, reiniciarlo o forzar
 * errores. Solo existe con SHOPIFY_MODE=fake.
 */
const notFound = () => new NextResponse(null, { status: 404 });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
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
  if (parsed.data.action === "reset") fakeShopify.reset();
  else
    fakeShopify.failNext(
      parsed.data.method,
      parsed.data.kind,
      parsed.data.message,
    );
  return NextResponse.json({ ok: true });
}
