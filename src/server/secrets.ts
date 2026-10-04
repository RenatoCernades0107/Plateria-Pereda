import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara dos secretos en tiempo constante, para no revelar por cuánto tiempo tarda la
 * comparación cuántos caracteres coinciden. Se comparan sus hashes para igualar largos.
 */
export function safeEqual(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b)) && a.length === b.length;
}
