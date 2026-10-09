/** Países para el código telefónico de los formularios (Perú primero y por defecto). */
export type Country = { iso: string; name: string; dial: string };

export const DEFAULT_COUNTRY_ISO = "PE";

export const COUNTRIES: readonly Country[] = [
  { iso: "PE", name: "Perú", dial: "51" },
  { iso: "US", name: "Estados Unidos / Canadá", dial: "1" },
  { iso: "AR", name: "Argentina", dial: "54" },
  { iso: "BO", name: "Bolivia", dial: "591" },
  { iso: "BR", name: "Brasil", dial: "55" },
  { iso: "CL", name: "Chile", dial: "56" },
  { iso: "CO", name: "Colombia", dial: "57" },
  { iso: "CR", name: "Costa Rica", dial: "506" },
  { iso: "EC", name: "Ecuador", dial: "593" },
  { iso: "SV", name: "El Salvador", dial: "503" },
  { iso: "ES", name: "España", dial: "34" },
  { iso: "GT", name: "Guatemala", dial: "502" },
  { iso: "HN", name: "Honduras", dial: "504" },
  { iso: "MX", name: "México", dial: "52" },
  { iso: "PA", name: "Panamá", dial: "507" },
  { iso: "PY", name: "Paraguay", dial: "595" },
  { iso: "UY", name: "Uruguay", dial: "598" },
  { iso: "VE", name: "Venezuela", dial: "58" },
  { iso: "FR", name: "Francia", dial: "33" },
  { iso: "DE", name: "Alemania", dial: "49" },
  { iso: "IT", name: "Italia", dial: "39" },
  { iso: "GB", name: "Reino Unido", dial: "44" },
];

export const DEFAULT_COUNTRY: Country = {
  iso: "PE",
  name: "Perú",
  dial: "51",
};

/** Emoji de bandera a partir del código ISO de dos letras. */
export const flagOf = (iso: string) =>
  String.fromCodePoint(
    ...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );

export const countryByIso = (iso: string) =>
  COUNTRIES.find((c) => c.iso === iso) ?? DEFAULT_COUNTRY;

/**
 * Separa un teléfono escrito (con o sin `+`, con espacios o guiones) en país y número
 * nacional. Sin `+` se asume el país de respaldo; con `+` gana el prefijo más largo.
 */
export function splitPhone(
  value: string,
  fallbackIso: string = DEFAULT_COUNTRY_ISO,
): { iso: string; national: string } {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) return { iso: fallbackIso, national: digits };
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));
  if (!match) return { iso: fallbackIso, national: digits };
  return { iso: match.iso, national: digits.slice(match.dial.length) };
}

/** Teléfono completo que se guarda en el formulario ("" si no hay número ni país elegido). */
export const joinPhone = (iso: string, national: string) => {
  const digits = national.replace(/\D/g, "");
  const { dial } = countryByIso(iso);
  if (digits) return `+${dial} ${digits}`;
  // Sin número, solo se conserva un país distinto del predeterminado.
  return iso === DEFAULT_COUNTRY_ISO ? "" : `+${dial}`;
};
