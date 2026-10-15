/** Catálogos simples que gestiona el admin desde Configuración (P22, N1). */
export const CATALOGS = {
  materials: {
    title: "Materiales",
    singular: "material",
    href: "/configuracion/materiales",
    hasPrice: false,
    hasShopifyName: false,
    description:
      "Se eligen en cada pieza (uno o varios). Si falta uno, admin y ventas lo crean desde el buscador de la pieza.",
  },
  services: {
    title: "Servicios",
    singular: "servicio",
    href: "/configuracion/servicios",
    hasPrice: true,
    hasShopifyName: false,
    description:
      "Se eligen en cada pieza. Si falta uno, admin y ventas lo crean desde el buscador de la pieza (sin precio sugerido; se agrega aquí).",
  },
  payment_methods: {
    title: "Métodos de pago",
    singular: "método de pago",
    href: "/configuracion/metodos-de-pago",
    hasPrice: false,
    hasShopifyName: true,
    description: "Se eligen al registrar un pago; se envían a Shopify.",
  },
} as const;

export type CatalogKind = keyof typeof CATALOGS;

export const CATALOG_KINDS = Object.keys(CATALOGS) as CatalogKind[];

export function isCatalogKind(value: string): value is CatalogKind {
  return value in CATALOGS;
}
