/**
 * Catálogos simples que gestiona el admin desde Configuración (P22, N1). Se pueden borrar
 * mientras nada los use (piezas y cotizaciones, o pagos); si no, solo se desactivan.
 * `deleteHint` lo explica en la confirmación de borrado.
 */
export const CATALOGS = {
  materials: {
    title: "Materiales",
    singular: "material",
    href: "/configuracion/materiales",
    hasPrice: false,
    hasShopifyName: false,
    deleteHint:
      "Si alguna pieza o cotización ya lo usa, no se podrá eliminar: desactívalo.",
    description:
      "Se eligen en cada pieza (uno o varios). Si falta uno, se agrega aquí. Solo se borran los que ninguna pieza usa; los demás se desactivan.",
  },
  services: {
    title: "Servicios",
    singular: "servicio",
    href: "/configuracion/servicios",
    hasPrice: true,
    hasShopifyName: false,
    deleteHint:
      "Si alguna pieza o cotización ya lo usa, no se podrá eliminar: desactívalo.",
    description:
      "Se eligen en cada pieza. Si falta uno, se agrega aquí, con su precio sugerido. Solo se borran los que ninguna pieza usa; los demás se desactivan.",
  },
  payment_methods: {
    title: "Métodos de pago",
    singular: "método de pago",
    href: "/configuracion/metodos-de-pago",
    hasPrice: false,
    hasShopifyName: true,
    deleteHint: "Si algún pago ya lo usa, no se podrá eliminar: desactívalo.",
    description:
      "Se eligen al registrar un pago; se envían a Shopify. Solo se borran los que ningún pago usa; los demás se desactivan.",
  },
} as const;

export type CatalogKind = keyof typeof CATALOGS;

/** Materiales y servicios: los catálogos que se eligen en cada pieza. */
export type PieceCatalogKind = "materials" | "services";

export const CATALOG_KINDS = Object.keys(CATALOGS) as CatalogKind[];

export function isCatalogKind(value: string): value is CatalogKind {
  return value in CATALOGS;
}
