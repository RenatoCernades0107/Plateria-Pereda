/** Errores de Shopify convertidos a tipos que el resto del sistema puede manejar. */
export class ShopifyError extends Error {
  /** Si vale la pena reintentar más tarde (red, límite de uso, caída de Shopify). */
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = new.target.name;
    this.retryable = retryable;
  }
}

/** Shopify rechazó los datos (userErrors): p. ej., email inválido o duplicado. */
export class ShopifyUserError extends ShopifyError {
  readonly fields: { field: string[] | null; message: string }[];

  constructor(fields: { field: string[] | null; message: string }[]) {
    super(fields.map((f) => f.message).join("; ") || "Datos rechazados");
    this.fields = fields;
  }
}

export class ShopifyNotFoundError extends ShopifyError {
  constructor(what: string) {
    super(`No existe en Shopify: ${what}`);
  }
}

/** Credenciales inválidas o sin permisos (no se arregla reintentando). */
export class ShopifyAuthError extends ShopifyError {}

/** Red, timeout, límite de uso (THROTTLED) o error 5xx: se puede reintentar. */
export class ShopifyUnavailableError extends ShopifyError {
  constructor(message: string) {
    super(message, true);
  }
}
