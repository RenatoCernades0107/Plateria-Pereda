import type {
  CompanyInput,
  CustomerInput,
  OrderEdit,
  OrderFinancials,
  OrderInput,
  Page,
  PageOptions,
  RefundInput,
  ShopifyCompany,
  ShopifyCompanyContact,
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

  /** Empresa como Company con su ubicación y, opcionalmente, su primer contacto (P14). */
  createCompany(input: CompanyInput): Promise<ShopifyCompany>;
  /** Crea un cliente nuevo y lo asocia a la empresa como contacto. */
  createCompanyContact(
    companyId: string,
    input: CustomerInput,
  ): Promise<ShopifyCompanyContact>;
  /** Asocia como contacto a un cliente que ya existe en Shopify. */
  assignCustomerAsContact(
    companyId: string,
    customerId: string,
  ): Promise<ShopifyCompanyContact>;

  createOrder(input: OrderInput): Promise<ShopifyOrder>;
  /**
   * Busca la orden por etiqueta, para no duplicarla si un reintento ya la creó. El
   * índice de búsqueda de Shopify tarda ~8 s (spike 4.1); el outbox reintenta recién
   * a los 30 s, así que la orden ya aparece.
   */
  findOrderByTag(tag: string): Promise<ShopifyOrder | null>;
  getOrderFinancials(orderId: string): Promise<OrderFinancials>;
  /** Cambiar un precio quita la línea y agrega otra con el mismo título (Shopify no
   * permite cambiar el precio de una línea personalizada existente). */
  editOrder(orderId: string, edit: OrderEdit): Promise<ShopifyOrder>;
  /**
   * Registra el pago que completa el saldo (en Grow no hay pagos parciales por API,
   * P43). Si el método no existe como pago manual en la tienda, queda como "manual".
   */
  recordFullPayment(orderId: string, gateway: string): Promise<OrderFinancials>;
  /** Reembolsa parte de lo cobrado con el mismo medio de pago. */
  refundPayment(orderId: string, refund: RefundInput): Promise<OrderFinancials>;
  /** Marca líneas como preparadas (P44). */
  fulfillLines(orderId: string, lineIds: string[]): Promise<ShopifyOrder>;

  searchProducts(
    query: string,
    options?: PageOptions,
  ): Promise<Page<ShopifyProductSummary>>;
  getProduct(id: string): Promise<ShopifyProduct | null>;
}
