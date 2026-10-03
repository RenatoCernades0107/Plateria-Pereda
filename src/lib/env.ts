import { z } from "zod";

const FALTA = "Falta definir esta variable";

const publicShape = {
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    protocol: /^https?$/,
    error: (issue) =>
      issue.input === undefined ? FALTA : "Debe ser una URL http(s) válida",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string({ error: FALTA }),
};

const publicSchema = z.object(publicShape);

const SHOPIFY_LIVE_VARS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_API_VERSION",
] as const;

const serverSchema = z
  .object({
    ...publicShape,
    SUPABASE_SECRET_KEY: z.string({ error: FALTA }),
    SHOPIFY_MODE: z
      .enum(["fake", "live"], { error: 'Debe ser "fake" o "live"' })
      .default("fake"),
    SHOPIFY_STORE_DOMAIN: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/,
        "Debe tener la forma tienda.myshopify.com",
      )
      .optional(),
    SHOPIFY_CLIENT_ID: z.string().optional(),
    SHOPIFY_CLIENT_SECRET: z.string().optional(),
    SHOPIFY_API_VERSION: z
      .string()
      .regex(
        /^\d{4}-(01|04|07|10)$/,
        "Debe tener la forma AAAA-MM de una versión de Shopify",
      )
      .optional(),
    CRON_SECRET: z
      .string()
      .min(16, "Debe tener al menos 16 caracteres")
      .optional(),
    APP_URL: z.url({
      protocol: /^https?$/,
      error: (issue) =>
        issue.input === undefined ? FALTA : "Debe ser una URL http(s) válida",
    }),
    APP_TIMEZONE: z.string().default("America/Lima"),
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.SHOPIFY_MODE === "live") {
      for (const key of SHOPIFY_LIVE_VARS) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Es obligatoria con SHOPIFY_MODE=live",
          });
        }
      }
    }
    if (env.VERCEL_ENV === "production") {
      if (env.SHOPIFY_MODE !== "live") {
        ctx.addIssue({
          code: "custom",
          path: ["SHOPIFY_MODE"],
          message:
            "En producción debe ser live: el Shopify falso no se usa con datos reales",
        });
      }
      if (!env.CRON_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["CRON_SECRET"],
          message: "Es obligatoria en producción",
        });
      }
    }
  });

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

type EnvSource = Record<string, string | undefined>;

function parse<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  // Un valor vacío (p. ej. `SHOPIFY_CLIENT_ID=` copiado de .env.example) cuenta como no definido.
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value?.trim() ? value : undefined,
    ]),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }
  return result.data;
}

export function parsePublicEnv(source: EnvSource): PublicEnv {
  return parse(publicSchema, source);
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  return parse(serverSchema, source);
}

let cachedPublicEnv: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  // Referencias literales: Next solo incluye en el navegador las process.env.NEXT_PUBLIC_* escritas así.
  cachedPublicEnv ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cachedPublicEnv;
}
