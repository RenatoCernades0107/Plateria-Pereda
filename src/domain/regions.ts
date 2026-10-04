/**
 * Regiones del Perú con el código que usa Shopify en las direcciones (zoneCode).
 * El spike 4.1 validó "LIM"; el resto sigue la norma ISO 3166-2:PE que usa Shopify.
 */
export const PERU_REGIONS = [
  { code: "AMA", name: "Amazonas" },
  { code: "ANC", name: "Áncash" },
  { code: "APU", name: "Apurímac" },
  { code: "ARE", name: "Arequipa" },
  { code: "AYA", name: "Ayacucho" },
  { code: "CAJ", name: "Cajamarca" },
  { code: "CAL", name: "Callao" },
  { code: "CUS", name: "Cusco" },
  { code: "HUV", name: "Huancavelica" },
  { code: "HUC", name: "Huánuco" },
  { code: "ICA", name: "Ica" },
  { code: "JUN", name: "Junín" },
  { code: "LAL", name: "La Libertad" },
  { code: "LAM", name: "Lambayeque" },
  { code: "LIM", name: "Lima" },
  { code: "LOR", name: "Loreto" },
  { code: "MDD", name: "Madre de Dios" },
  { code: "MOQ", name: "Moquegua" },
  { code: "PAS", name: "Pasco" },
  { code: "PIU", name: "Piura" },
  { code: "PUN", name: "Puno" },
  { code: "SAM", name: "San Martín" },
  { code: "TAC", name: "Tacna" },
  { code: "TUM", name: "Tumbes" },
  { code: "UCA", name: "Ucayali" },
] as const;

export type RegionCode = (typeof PERU_REGIONS)[number]["code"];

export const REGION_CODES = PERU_REGIONS.map((r) => r.code) as [
  RegionCode,
  ...RegionCode[],
];

export const DEFAULT_REGION: RegionCode = "LIM";
