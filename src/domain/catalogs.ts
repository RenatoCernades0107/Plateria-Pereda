/**
 * Catálogos simples que gestiona el admin desde Configuración (P22, N1). `canDelete`: se
 * pueden borrar mientras ninguna pieza ni cotización los use; si no, solo se desactivan.
 */
export const CATALOGS = {
  materials: {
    title: "Materiales",
    singular: "material",
    href: "/configuracion/materiales",
    hasPrice: false,
    hasShopifyName: false,
    canDelete: true,
    description:
      "Se eligen en cada pieza (uno o varios). Si falta uno, se agrega aquí. Solo se borran los que ninguna pieza usa; los demás se desactivan.",
  },
  services: {
    title: "Servicios",
    singular: "servicio",
    href: "/configuracion/servicios",
    hasPrice: true,
    hasShopifyName: false,
    canDelete: true,
    description:
      "Se eligen en cada pieza. Si falta uno, se agrega aquí, con su precio sugerido. Solo se borran los que ninguna pieza usa; los demás se desactivan.",
  },
  payment_methods: {
    title: "Métodos de pago",
    singular: "método de pago",
    href: "/configuracion/metodos-de-pago",
    hasPrice: false,
    hasShopifyName: true,
    canDelete: false,
    description: "Se eligen al registrar un pago; se envían a Shopify.",
  },
} as const;

export type CatalogKind = keyof typeof CATALOGS;

/** Materiales y servicios: los catálogos que se eligen en cada pieza. */
export type PieceCatalogKind = "materials" | "services";

export const CATALOG_KINDS = Object.keys(CATALOGS) as CatalogKind[];

export function isCatalogKind(value: string): value is CatalogKind {
  return value in CATALOGS;
}
