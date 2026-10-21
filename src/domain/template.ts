/** Plantillas con variables entre llaves (WhatsApp, alertas). */

const PLACEHOLDER = /\{([^{}]*)\}/g;

/** Variables escritas en la plantilla que no existen (p. ej., "{clienet}"). */
export function unknownTemplatePlaceholders(
  template: string,
  known: Readonly<Record<string, string>>,
): string[] {
  const found = [...template.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "");
  return [...new Set(found.filter((name) => !(name in known)))];
}

/** Reemplaza las variables conocidas; las que no tienen valor quedan vacías. */
export function renderTemplate<K extends string>(
  template: string,
  known: Readonly<Record<K, string>>,
  values: Partial<Record<K, string>>,
): string {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in known ? (values[name as K] ?? "") : match,
  );
}
