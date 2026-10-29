/**
 * Variables públicas para el navegador, sin zod: Next las incrusta al compilar y el
 * servidor ya las valida al arrancar (`instrumentation.ts`). Así el menú, que crea el
 * cliente de Supabase para la campana de alertas, no arrastra zod (~90 KB) a todas las
 * páginas (Paso 15.3).
 */
export function browserEnv() {
  // Referencias literales: Next solo incluye en el navegador las process.env.NEXT_PUBLIC_* escritas así.
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}
