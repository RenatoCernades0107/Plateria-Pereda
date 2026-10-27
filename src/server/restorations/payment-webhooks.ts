import {
  webhookOrderCustomer,
  webhookOrderId,
  type OrderCustomer,
} from "@/domain/shopify-transactions";
import type { WebhookHandler } from "@/server/shopify-webhooks/types";

/** Lo que los webhooks de la orden necesitan de la BD y del outbox. */
export interface OrderWebhookRepository {
  /**
   * Restauración de la orden: su orden de piezas (guías antiguas) o el pedido de uno de
   * sus pagos (`paymentOrder`). null si la orden no es de una restauración.
   */
  findRestorationByOrder(
    orderId: string,
  ): Promise<{ restorationId: string; paymentOrder: boolean } | null>;
  /** Encola la conciliación de pagos (`payment.sync`). */
  enqueuePaymentSync(restorationId: string): Promise<void>;
  /** Cambio del cliente de la orden hecho en Shopify (D31). */
  applyOrderCustomer(
    restorationId: string,
    customer: OrderCustomer,
  ): Promise<boolean>;
}

export const ORDER_PAYMENT_TOPICS = [
  "orders/paid",
  "orders/updated",
  "order_transactions/create",
  "refunds/create",
] as const;

/**
 * Webhooks de la orden (Paso 11.3). No confían en el contenido del webhook para los
 * pagos: solo identifican la restauración y encolan `payment.sync`, que lee de Shopify
 * las transacciones actuales (webhooks duplicados o desordenados dan el mismo
 * resultado). Las órdenes que no son de restauraciones se ignoran. `orders/updated`
 * de la orden de piezas además aplica el cambio de cliente; el de un pedido de pago
 * no cambia el cliente de la guía.
 */
export function orderWebhookHandlers(
  repo: OrderWebhookRepository,
  /** Procesa el outbox (el webhook ya corre después de responder). */
  processOutbox: () => Promise<unknown>,
): Record<string, WebhookHandler> {
  const handle = (topic: string): WebhookHandler => {
    return async (event) => {
      const orderId = webhookOrderId(topic, event.payload);
      if (!orderId) throw new Error("El webhook no trae el id de la orden");
      const found = await repo.findRestorationByOrder(orderId);
      if (!found) return;
      const { restorationId } = found;
      if (topic === "orders/updated" && !found.paymentOrder) {
        const customer = webhookOrderCustomer(event.payload);
        if (customer) await repo.applyOrderCustomer(restorationId, customer);
      }
      await repo.enqueuePaymentSync(restorationId);
      await processOutbox();
    };
  };
  return Object.fromEntries(ORDER_PAYMENT_TOPICS.map((t) => [t, handle(t)]));
}
