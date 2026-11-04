/**
 * Parámetros de una URL como los da `searchParams` a una página: los repetidos
 * (`?estado=lista&estado=completada`) como lista. `Object.fromEntries` se quedaría
 * solo con el último y los filtros de selección múltiple se perderían.
 */
export function searchParamsRecord(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length === 1 ? values[0]! : values;
  }
  return record;
}
