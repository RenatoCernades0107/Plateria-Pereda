const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
// 10: persona natural; 15, 16, 17: otros contribuyentes; 20: persona jurídica.
const PREFIXES = ["10", "15", "16", "17", "20"];

/** Valida un RUC peruano: 11 dígitos, prefijo de contribuyente y dígito verificador (módulo 11). */
export function isValidRuc(value: string): boolean {
  if (!/^\d{11}$/.test(value) || !PREFIXES.includes(value.slice(0, 2))) {
    return false;
  }
  const sum = WEIGHTS.reduce(
    (acc, weight, i) => acc + weight * Number(value[i]),
    0,
  );
  const check = (11 - (sum % 11)) % 10;
  return check === Number(value[10]);
}
