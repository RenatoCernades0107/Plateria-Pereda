/**
 * Logs estructurados del servidor (Paso 15.4): una línea JSON por evento, que Vercel
 * guarda y permite filtrar por `level`, `msg` o cualquier campo del contexto.
 *
 * Nunca deben salir secretos ni datos personales: las claves con nombre sensible se
 * reemplazan por "[oculto]" y los valores con forma de token, clave o email se tapan
 * aunque lleguen dentro de un mensaje de error.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const REDACTED = "[oculto]";
const MAX_DEPTH = 5;

/** Nombres de campo cuyo valor nunca se escribe. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|hmac|signature|credential|session|email|phone|telefono|document|dni|ruc|address|direccion/i;

/** Valores con forma de secreto (en cualquier campo o mensaje). */
const SENSITIVE_VALUES: [RegExp, string][] = [
  // JWT (sesiones de Supabase, claves antiguas).
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  // Claves de Supabase y tokens de Shopify.
  [/\b(sb_secret|sb_publishable|shpat|shpca|shpss)_[\w-]+/g, REDACTED],
  [/\bBearer\s+[\w.~+/-]+=*/gi, `Bearer ${REDACTED}`],
  // El dominio termina en letras: no confunde rutas como `react@19.2.8`.
  [/[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}\b/gi, REDACTED],
];

function scrub(text: string): string {
  return SENSITIVE_VALUES.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  );
}

function serializeError(error: Error, depth: number): LogContext {
  const extra = error as Error & {
    code?: unknown;
    digest?: unknown;
    status?: unknown;
  };
  return sanitize(
    {
      name: error.name,
      message: error.message,
      ...(extra.code !== undefined ? { code: extra.code } : {}),
      ...(extra.status !== undefined ? { status: extra.status } : {}),
      ...(extra.digest !== undefined ? { digest: extra.digest } : {}),
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
      ...(error.cause !== undefined ? { cause: error.cause } : {}),
    },
    depth,
  ) as LogContext;
}

/** Copia apta para el log: sin secretos, sin ciclos y con los errores legibles. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrub(value);
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (depth >= MAX_DEPTH) return "[…]";
  if (value instanceof Error) return serializeError(value, depth + 1);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitize(v, depth + 1),
    ]),
  );
}

export function formatLog(
  level: LogLevel,
  msg: string,
  context: LogContext = {},
  now = new Date(),
): string {
  return JSON.stringify({
    level,
    time: now.toISOString(),
    msg: scrub(msg),
    ...(sanitize(context) as LogContext),
  });
}

function write(level: LogLevel, msg: string, context?: LogContext) {
  const line = formatLog(level, msg, context);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (msg: string, context?: LogContext) => write("info", msg, context),
  warn: (msg: string, context?: LogContext) => write("warn", msg, context),
  error: (msg: string, context?: LogContext) => write("error", msg, context),
};
