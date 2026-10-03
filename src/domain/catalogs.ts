/** Catálogos simples que gestiona el admin desde Configuración (P22, N1). */
export const CATALOGS = {
  materials: {
    title: "Materiales",
    singular: "material",
    href: "/configuracion/materiales",
    hasPrice: false,
    description:
      "Se proponen al registrar cada pieza; también se puede escribir otro.",
  },
  services: {
    title: "Servicios",
    singular: "servicio",
    href: "/configuracion/servicios",
    hasPrice: true,
    description:
      "Se proponen al cotizar cada pieza, con su precio sugerido (editable en cada pieza).",
  },
  payment_methods: {
    title: "Métodos de pago",
    singular: "método de pago",
    href: "/configuracion/metodos-de-pago",
    hasPrice: false,
    description: "Se eligen al registrar un pago; se envían a Shopify.",
  },
} as const;

export type CatalogKind = keyof typeof CATALOGS;

export const CATALOG_KINDS = Object.keys(CATALOGS) as CatalogKind[];

export function isCatalogKind(value: string): value is CatalogKind {
  return value in CATALOGS;
}
