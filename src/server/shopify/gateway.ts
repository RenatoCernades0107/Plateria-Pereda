import type {
  CustomerInput,
  OrderEdit,
  OrderFinancials,
  OrderInput,
  Page,
  PageOptions,
  PaymentInput,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyProduct,
  ShopifyProductSummary,
} from "./types";

/**
 * Puerto hacia Shopify (D04). El adaptador `live` llama a la API de la tienda y el
 * `fake` guarda todo en memoria para desarrollo y tests.
 */
export interface ShopifyGateway {
  createCustomer(input: CustomerInput): Promise<ShopifyCustomer>;
  updateCustomer(
    id: string,
    input: Partial<CustomerInput>,
  ): Promise<ShopifyCustomer>;
  /** Busca por nombre, email o teléfono. */
  searchCustomers(
    query: string,
    options?: PageOptions,
  ): Promise<Page<ShopifyCustomer>>;
  getCustomer(id: string): Promise<ShopifyCustomer | null>;

  createOrder(input: OrderInput): Promise<ShopifyOrder>;
  /** Busca la orden por etiqueta: evita duplicarla si un reintento ya la creó. */
  findOrderByTag(tag: string): Promise<ShopifyOrder | null>;
  getOrderFinancials(orderId: string): Promise<OrderFinancials>;
  editOrder(orderId: string, edit: OrderEdit): Promise<ShopifyOrder>;
  /** Registra el pago que completa el saldo (en Grow no hay pagos parciales por API, P43). */
  recordFullPayment(orderId: string, gateway: string): Promise<OrderFinancials>;
  refundPayment(
    orderId: string,
    payment: PaymentInput,
  ): Promise<OrderFinancials>;
  /** Marca líneas como preparadas (P44). */
  fulfillLines(orderId: string, lineIds: string[]): Promise<ShopifyOrder>;

  searchProducts(
    query: string,
    options?: PageOptions,
  ): Promise<Page<ShopifyProductSummary>>;
  getProduct(id: string): Promise<ShopifyProduct | null>;
}
