/**
 * Utilidades comunes de los filtros de lista que viven en la URL. Los filtros de
 * selección múltiple se repiten en la URL (`?estado=a&estado=b`); sin ninguno, no hay
 * filtro.
 */

export type SearchParams = Record<string, string | string[] | undefined>;
type Param = string | string[] | undefined;

/** Todos los valores de un parámetro, repetido o no. */
export const list = (value: Param): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Valores del parámetro que están entre las opciones, sin repetir. */
export function manyOf<T extends string>(
  options: readonly T[],
  value: Param,
): T[] {
  return [
    ...new Set(
      list(value).filter((v): v is T =>
        (options as readonly string[]).includes(v),
      ),
    ),
  ];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID válidos del parámetro, en minúsculas y sin repetir. */
export const manyUuids = (value: Param): string[] => [
  ...new Set(
    list(value)
      .filter((v) => UUID.test(v))
      .map((v) => v.toLowerCase()),
  ),
];

/** Repite el parámetro por cada valor (`[]` no escribe nada). */
export function appendAll(
  params: URLSearchParams,
  name: string,
  values: readonly string[],
) {
  for (const v of values) params.append(name, v);
}
